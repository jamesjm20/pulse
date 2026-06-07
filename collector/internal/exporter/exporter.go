package exporter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/pulse/collector/internal/config"
	"github.com/pulse/collector/internal/store"
)

type Exporter struct {
	cfg    config.ExporterConfig
	store  *store.Store
	logger *zap.Logger
	client *http.Client
	flush  time.Duration
}

func New(cfg config.ExporterConfig, s *store.Store, logger *zap.Logger) (*Exporter, error) {
	d, err := time.ParseDuration(cfg.FlushInterval)
	if err != nil {
		return nil, fmt.Errorf("invalid flush_interval %q: %w", cfg.FlushInterval, err)
	}

	return &Exporter{
		cfg:    cfg,
		store:  s,
		logger: logger,
		client: &http.Client{Timeout: 15 * time.Second},
		flush:  d,
	}, nil
}

func (e *Exporter) Start(ctx context.Context) error {
	ticker := time.NewTicker(e.flush)
	defer ticker.Stop()

	e.logger.Info("exporter started",
		zap.String("backend", e.cfg.BackendURL),
		zap.Duration("flush_interval", e.flush),
		zap.Int("batch_size", e.cfg.BatchSize),
	)

	for {
		select {
		case <-ctx.Done():
			// Final flush before exit
			e.flush_batch()
			return nil
		case <-ticker.C:
			e.flush_batch()
		}
	}
}

func (e *Exporter) flush_batch() {
	spans, err := e.store.UnexportedSpans(e.cfg.BatchSize)
	if err != nil {
		e.logger.Error("failed to fetch unexported spans", zap.Error(err))
		return
	}
	if len(spans) == 0 {
		return
	}

	if err := e.sendBatch(spans); err != nil {
		e.logger.Warn("batch send failed, will retry",
			zap.Int("count", len(spans)),
			zap.Error(err),
		)
		return
	}

	ids := make([]string, len(spans))
	for i, sp := range spans {
		ids[i] = sp.ID
	}
	if err := e.store.MarkExported(ids); err != nil {
		e.logger.Error("failed to mark spans exported", zap.Error(err))
	}

	e.logger.Info("exported batch", zap.Int("count", len(spans)))
}

// batchPayload is what we POST to the backend.
type batchPayload struct {
	Spans []*store.Span `json:"spans"`
}

func (e *Exporter) sendBatch(spans []*store.Span) error {
	payload, err := json.Marshal(batchPayload{Spans: spans})
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, e.cfg.BackendURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("backend returned %d", resp.StatusCode)
	}
	return nil
}
