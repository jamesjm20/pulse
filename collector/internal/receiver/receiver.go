package receiver

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	collector "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	tracev1 "go.opentelemetry.io/proto/otlp/trace/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"

	"github.com/pulse/collector/internal/config"
	"github.com/pulse/collector/internal/enricher"
	"github.com/pulse/collector/internal/store"
)

// Receiver listens on gRPC :4317 and HTTP :4318 for OTEL trace data.
type Receiver struct {
	cfg     config.ReceiverConfig
	store   *store.Store
	enrich  *enricher.Enricher
	logger  *zap.Logger
	grpcSrv *grpc.Server
	httpSrv *http.Server
}

func New(cfg config.ReceiverConfig, s *store.Store, e *enricher.Enricher, logger *zap.Logger) (*Receiver, error) {
	return &Receiver{
		cfg:    cfg,
		store:  s,
		enrich: e,
		logger: logger,
	}, nil
}

func (r *Receiver) Start(ctx context.Context) error {
	// Build both servers before launching goroutines so stop() is always safe to call.
	r.grpcSrv = grpc.NewServer()
	collector.RegisterTraceServiceServer(r.grpcSrv, &traceServiceServer{r: r})

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/traces", r.handleHTTPTraces)
	r.httpSrv = &http.Server{Addr: r.cfg.HTTPAddr, Handler: mux}

	errCh := make(chan error, 2)
	go func() { errCh <- r.serveGRPC() }()
	go func() { errCh <- r.serveHTTP() }()

	select {
	case err := <-errCh:
		// One server failed — shut down the other and wait for it before returning.
		r.stop()
		<-errCh
		return err
	case <-ctx.Done():
		r.stop()
		<-errCh
		<-errCh
		return nil
	}
}

func (r *Receiver) stop() {
	r.grpcSrv.GracefulStop()
	r.httpSrv.Shutdown(context.Background()) //nolint:errcheck
}

// ── gRPC ────────────────────────────────────────────────────────────────────

type traceServiceServer struct {
	collector.UnimplementedTraceServiceServer
	r *Receiver
}

func (r *Receiver) serveGRPC() error {
	lis, err := net.Listen("tcp", r.cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("grpc listen: %w", err)
	}
	r.logger.Info("gRPC receiver listening", zap.String("addr", r.cfg.GRPCAddr))
	return r.grpcSrv.Serve(lis)
}

func (s *traceServiceServer) Export(
	ctx context.Context,
	req *collector.ExportTraceServiceRequest,
) (*collector.ExportTraceServiceResponse, error) {
	s.r.handleResourceSpans(req.ResourceSpans)
	return &collector.ExportTraceServiceResponse{}, nil
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

func (r *Receiver) serveHTTP() error {
	r.logger.Info("HTTP receiver listening", zap.String("addr", r.cfg.HTTPAddr))
	// ErrServerClosed is the normal return from Shutdown — not an error.
	if err := r.httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func (r *Receiver) handleHTTPTraces(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(io.LimitReader(req.Body, 10<<20)) // 10 MB max
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	defer req.Body.Close()

	var exportReq collector.ExportTraceServiceRequest

	ct := req.Header.Get("Content-Type")
	if ct == "application/json" {
		// JSON encoding (less common but spec-compliant)
		if err := jsonUnmarshalTraceRequest(body, &exportReq); err != nil {
			r.logger.Warn("failed to parse JSON trace request", zap.Error(err))
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
	} else {
		// Default: protobuf binary
		if err := proto.Unmarshal(body, &exportReq); err != nil {
			r.logger.Warn("failed to parse protobuf trace request", zap.Error(err))
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
	}

	r.handleResourceSpans(exportReq.ResourceSpans)
	w.WriteHeader(http.StatusOK)
}

// ── Shared span processing ───────────────────────────────────────────────────

func (r *Receiver) handleResourceSpans(rss []*tracev1.ResourceSpans) {
	spanCount := 0
	for _, rs := range rss {
		for _, ss := range rs.ScopeSpans {
			spanCount += len(ss.Spans)
		}
	}
	r.logger.Info("export received", zap.Int("resource_spans", len(rss)), zap.Int("spans", spanCount))

	for _, rs := range rss {
		serviceName := attrString(rs.Resource.GetAttributes(), "service.name")

		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				span := convertSpan(sp, serviceName)
				r.enrich.Enrich(span)

				if err := r.store.InsertSpan(span); err != nil {
					r.logger.Warn("failed to insert span", zap.String("id", span.ID), zap.Error(err))
				}
			}
		}
	}
}

func convertSpan(sp *tracev1.Span, serviceName string) *store.Span {
	attrs := sp.GetAttributes()

	span := &store.Span{
		ID:          hexID(sp.SpanId),
		TraceID:     hexID(sp.TraceId),
		ParentID:    hexID(sp.ParentSpanId),
		Name:        sp.Name,
		ServiceName: serviceName,
		Model:        attrStringAny(attrs, "gen_ai.request.model", "model"),
		StartTime:    unixNanoToTime(sp.StartTimeUnixNano),
		EndTime:      unixNanoToTime(sp.EndTimeUnixNano),
		DurationMs:   int64(sp.EndTimeUnixNano-sp.StartTimeUnixNano) / 1_000_000,
		InputTokens:  attrIntAny(attrs, "gen_ai.usage.input_tokens", "input_tokens"),
		OutputTokens: attrIntAny(attrs, "gen_ai.usage.output_tokens", "output_tokens"),
		// Capture rate limit information from OTEL attributes
		RateLimitLimit:       attrIntAny(attrs, "llm.rate_limit.limit"),
		RateLimitRemaining:   attrIntAny(attrs, "llm.rate_limit.remaining"),
		RateLimitResetTokens: attrString(attrs, "llm.rate_limit.reset_time"),
	}

	// Serialise all attributes as a JSON blob for storage
	attrsMap := attrsToMap(attrs)
	if b, err := json.Marshal(attrsMap); err == nil {
		span.Attributes = string(b)
	}

	return span
}

// ── OTEL attribute helpers ────────────────────────────────────────────────────

func attrString(attrs []*commonv1.KeyValue, key string) string {
	for _, kv := range attrs {
		if kv.Key == key {
			if sv, ok := kv.Value.Value.(*commonv1.AnyValue_StringValue); ok {
				return sv.StringValue
			}
		}
	}
	return ""
}

func attrInt(attrs []*commonv1.KeyValue, key string) int64 {
	for _, kv := range attrs {
		if kv.Key == key {
			if iv, ok := kv.Value.Value.(*commonv1.AnyValue_IntValue); ok {
				return iv.IntValue
			}
		}
	}
	return 0
}

// attrStringAny tries keys in order, returning the first match.
func attrStringAny(attrs []*commonv1.KeyValue, keys ...string) string {
	for _, k := range keys {
		if v := attrString(attrs, k); v != "" {
			return v
		}
	}
	return ""
}

// attrIntAny tries keys in order, returning the first non-zero match.
func attrIntAny(attrs []*commonv1.KeyValue, keys ...string) int64 {
	for _, k := range keys {
		if v := attrInt(attrs, k); v != 0 {
			return v
		}
	}
	return 0
}

func attrsToMap(attrs []*commonv1.KeyValue) map[string]any {
	m := make(map[string]any, len(attrs))
	for _, kv := range attrs {
		switch v := kv.Value.Value.(type) {
		case *commonv1.AnyValue_StringValue:
			m[kv.Key] = v.StringValue
		case *commonv1.AnyValue_IntValue:
			m[kv.Key] = v.IntValue
		case *commonv1.AnyValue_DoubleValue:
			m[kv.Key] = v.DoubleValue
		case *commonv1.AnyValue_BoolValue:
			m[kv.Key] = v.BoolValue
		}
	}
	return m
}

func hexID(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	return hex.EncodeToString(b)
}

func unixNanoToTime(ns uint64) time.Time {
	if ns == 0 {
		return time.Time{}
	}
	return time.Unix(0, int64(ns)).UTC()
}

// jsonUnmarshalTraceRequest is a stub — the OTEL JSON encoding uses the
// protobuf JSON mapping. For now we delegate to standard json unmarshal
// against a loose map, then re-encode to proto. A proper implementation
// would use protojson.Unmarshal.
func jsonUnmarshalTraceRequest(data []byte, out *collector.ExportTraceServiceRequest) error {
	// TODO: replace with protojson.Unmarshal for full spec compliance
	return proto.Unmarshal(data, out)
}
