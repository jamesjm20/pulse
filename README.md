# Pulse — Real-Time Claude API Observability

Pulse is an observability platform that captures, enriches, and visualizes OTEL traces from Claude API calls. Monitor cost, latency, token usage, and model performance in real-time.

![Pulse Dashboard](https://via.placeholder.com/1200x600?text=Pulse+Dashboard)

## Features

- **Real-time trace capture** — Receives OTEL traces via gRPC and HTTP
- **Cost enrichment** — Automatically calculates USD cost per trace and span using Claude model pricing
- **Model performance metrics** — Latency, token efficiency, and cost breakdown by model
- **Interactive dashboard** — Overview, trace list, detailed trace waterfall, sorting and filtering
- **Persistent storage** — SQLite database with automatic span aggregation
- **Dockerized** — Single `docker-compose up` to run the entire stack

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Claude Code (for telemetry integration)

### Running Pulse

```bash
cd pulse
docker-compose up
```

Access the dashboard at **http://localhost**

The collector listens for traces on:
- **gRPC**: localhost:4317
- **HTTP**: localhost:4318

The backend API is at **localhost:3000**

## Architecture

Pulse is a monorepo with three services:

```
pulse/
├── collector/   # Go — OTEL receiver, cost enricher, batch exporter
├── backend/     # Node.js — REST API, span aggregation, SQLite persistence
└── dashboard/   # React + Vite — Web UI with real-time metrics
```

### Data Flow

1. **Collector (Go)** — Receives OTEL spans on :4317 (gRPC) and :4318 (HTTP)
2. Enriches spans with USD cost using `pulse.yaml` model pricing
3. Batches spans and exports to backend every 10 seconds
4. **Backend (Node.js)** — Receives spans, stores in SQLite, serves REST API
5. **Dashboard (React)** — Queries backend API, displays traces and metrics

### Configuration

Edit `collector/pulse.yaml` to customize:

```yaml
receiver:
  grpc_addr: ":4317"
  http_addr: ":4318"

enricher:
  model_pricing:
    claude-opus-4-8:
      input_price_per_1m: 5.00
      output_price_per_1m: 25.00
    # ... add models here

exporter:
  backend_url: "http://backend:3000/api/spans"
  batch_size: 100
  flush_interval: "10s"
```

## API Endpoints

### GET /api/stats
Aggregate metrics (totals, per-model breakdown, hourly timeline)

**Query params**: `since`, `until` (ISO 8601 timestamps)

```bash
curl http://localhost:3000/api/stats
```

Response:
```json
{
  "totals": {
    "trace_count": 13,
    "span_count": 120,
    "total_cost_usd": 0.171,
    "avg_duration_ms": 9544
  },
  "byModel": [
    {
      "model": "claude-opus-4-8",
      "cost_usd": 0.150,
      "token_efficiency": 2.5,
      "avg_duration_ms": 8500
    }
  ],
  "costTimeline": [...]
}
```

### GET /api/traces
List traces with pagination and filtering

**Query params**: `limit` (default 50, max 200), `offset`, `since`, `until`

```bash
curl "http://localhost:3000/api/traces?limit=10"
```

### GET /api/traces/:traceId
Get all spans within a trace

```bash
curl http://localhost:3000/api/traces/abc123def456
```

### GET /health
Health check

```bash
curl http://localhost:3000/health
```

## Dashboard Pages

### Overview
- Key metrics: total cost, latency, tokens, trace count
- Cost timeline chart (hourly)
- Model breakdown with cost and latency
- Token efficiency by model

### Traces
- Sortable list of all traces (by recent, cost, duration)
- Click a row to view trace details
- Summary cards with total cost, average cost, trace count

### Trace Detail
- Waterfall view showing span timing and nesting
- Summary metrics for the trace
- Span-level cost and token data

## Sending Traces to Pulse

### Via Claude Code

Pulse is automatically configured to capture Claude Code telemetry. Check `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf"
  }
}
```

### Via Custom Application

Send OTEL spans to the collector using any OpenTelemetry SDK:

**Python:**
```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

exporter = OTLPSpanExporter(endpoint="localhost:4317")
trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(exporter))

tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("my_operation"):
    # your code here
    pass
```

**JavaScript:**
```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'grpc://localhost:4317' })
});
sdk.start();

const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('my-app');
const span = tracer.startSpan('my_operation');
// your code here
span.end();
```

## Model Pricing

Pulse supports any Claude model. Update `collector/pulse.yaml` with the latest pricing from [Anthropic's pricing page](https://www.anthropic.com/pricing/claude):

```yaml
enricher:
  model_pricing:
    claude-haiku-4-5:
      input_price_per_1m: 1.00
      output_price_per_1m: 5.00
    claude-sonnet-4-6:
      input_price_per_1m: 3.00
      output_price_per_1m: 15.00
```

Pricing uses longest-prefix matching, so `claude-haiku-4-5` will match any model ID starting with that string (e.g., `claude-haiku-4-5-20251001`).

## Database

Pulse uses SQLite for storage. The database is persisted in a Docker volume (`pulse_db`) and stored at `/app/data/pulse.db` in the containers.

### Reset Database

```bash
docker-compose down -v
```

This removes all traces and metrics.

## Development

### Backend (Node.js)

```bash
cd backend
npm install
npm run dev
```

Server runs on port 3000. Routes are in `src/routes/`.

### Dashboard (React)

```bash
cd dashboard
npm install
npm run dev
```

Dev server runs on port 5173 and proxies `/api` to `http://localhost:3000`.

### Collector (Go)

```bash
cd collector
go run ./cmd/collector
```

Requires the `pulse.yaml` config file in the working directory.

## Troubleshooting

### Dashboard shows "No data yet"

1. Verify the collector is running: `docker-compose logs collector`
2. Check that traces are reaching the collector:
   ```bash
   docker-compose logs collector | grep "export received"
   ```
3. Verify the backend is saving spans:
   ```bash
   curl http://localhost:3000/api/stats
   ```

### "Cost showing as $0.00"

1. Check that the model is in `collector/pulse.yaml`
2. Verify the model ID prefix matches (e.g., `claude-haiku-4-5` matches `claude-haiku-4-5-20251001`)
3. Restart the collector to reload the config:
   ```bash
   docker-compose restart collector
   ```

### Port already in use

Edit `docker-compose.yml` to map to different ports:

```yaml
services:
  backend:
    ports:
      - "3001:3000"  # Changed from 3000
  dashboard:
    ports:
      - "8080:80"    # Changed from 80
```

## Contributing

Improvements welcome! Some ideas:

- [ ] Export traces to external services (Datadog, New Relic, etc.)
- [ ] Custom alerting (e.g., notify when cost exceeds threshold)
- [ ] Trace comparison view (compare latency/cost between models)
- [ ] Automated cost optimization recommendations
- [ ] Support for Anthropic Batch API

## License

MIT
