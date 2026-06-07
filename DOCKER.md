# Running Pulse with Docker

Pulse is packaged as three Docker services: collector (Go), backend (Node.js), and dashboard (React).

## Prerequisites

- Docker and Docker Compose installed

## Quick Start

1. **Update the collector config for Docker**

   In `collector/pulse.yaml`, change the backend URL from `localhost` to the service name:
   ```yaml
   exporter:
     backend_url: "http://backend:3000/api/spans"
   ```

2. **Start all services**

   ```bash
   docker-compose up --build
   ```

   This will:
   - Build and start the collector (gRPC :4317, HTTP :4318)
   - Build and start the backend (HTTP :3000)
   - Build and start the dashboard (HTTP :80)

3. **Access the dashboard**

   Open `http://localhost` in your browser.

## Services

| Service   | Port  | Purpose                                      |
|-----------|-------|----------------------------------------------|
| collector | 4317  | gRPC OTEL trace receiver                     |
| collector | 4318  | HTTP OTEL trace receiver                     |
| backend   | 3000  | REST API for spans and stats                 |
| dashboard | 80    | React UI (proxies `/api` to backend)         |

## Database Persistence

The SQLite database is stored in a Docker volume (`pulse_db`) and persists across container restarts.

To reset the database:
```bash
docker-compose down -v
```

## Development Mode

For local development without Docker, follow the original setup in the collector, backend, and dashboard READMEs.

## Troubleshooting

**Port already in use:** If ports 80, 3000, 4317, or 4318 are already occupied, edit `docker-compose.yml` to map to different ports.

**Database locked:** If you get "database is locked" errors, ensure only one instance of the backend is running.

**Collector can't reach backend:** Make sure `pulse.yaml` uses `http://backend:3000` (not `localhost`) for the exporter backend URL.
