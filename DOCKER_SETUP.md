# Docker Setup for Pulse with Rate Limits

Running Pulse (collector, backend, dashboard, and proxy) in Docker with Claude Code on your host machine.

## Architecture

```
┌─ HOST MACHINE ──────────────────────────────────────────────┐
│                                                              │
│  Claude Code (CLI)                                          │
│  export ANTHROPIC_BASE_URL=http://localhost:8888           │
│  export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1                │
│          ↓                                                   │
│  http://localhost:8888 (port on host)                       │
└──────────┬──────────────────────────────────────────────────┘
           ↓
┌─ DOCKER (pulse network) ────────────────────────────────────┐
│                                                              │
│  ┌──────────────────┐                                        │
│  │ Proxy (8888)     │ ← Claude Code connects here            │
│  │ • Listen 8888    │                                        │
│  │ • Forward to API │                                        │
│  │ • POST to backend│                                        │
│  └────────┬─────────┘                                        │
│           ↓                                                   │
│  ┌──────────────────┐   ┌──────────────────┐                │
│  │ Collector        │   │ Backend (3000)   │                │
│  │ (4317/4318)      │   │ • API endpoints  │                │
│  │ • OTEL receiver  │   │ • /api/rate-... │                │
│  │ • Store spans    │   │ • DB queries     │                │
│  └────────┬─────────┘   └────────┬─────────┘                │
│           │                      │                           │
│           └──────────┬───────────┘                           │
│                      ↓                                        │
│              ┌─────────────────┐                             │
│              │ Shared Database │                             │
│              │ (pulse_db)      │                             │
│              └────────┬────────┘                             │
│                       ↓                                       │
│              ┌─────────────────┐                             │
│              │ Dashboard (80)  │                             │
│              │ http://locahost │                             │
│              └─────────────────┘                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Build and Run

```bash
cd pulse
docker-compose up -d
```

This builds and starts all services:
- Proxy on port 8888
- Backend on port 3000
- Collector on ports 4317/4318
- Dashboard on port 80

### 2. Configure Claude Code (on host machine)

```bash
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Use Claude Code

```bash
claude code my-file.js
```

Rate limits will automatically appear in the dashboard.

### 4. View Dashboard

Open http://localhost in your browser (or http://localhost:80)

## Service Configuration

### Proxy Service

```yaml
proxy:
  build:
    context: ./proxy
  ports:
    - "8888:8888"                                    # Exposed to host
  environment:
    - BACKEND_ENDPOINT=http://backend:3000/api/rate-limits  # Internal networking
  depends_on:
    - backend
  networks:
    - pulse
```

**Key points**:
- Port `8888:8888` maps container port to host port (Claude Code → localhost:8888)
- `BACKEND_ENDPOINT` uses `backend` hostname (Docker DNS within pulse network)
- `depends_on` ensures backend starts first
- `networks: pulse` puts proxy on shared network with other services

### Backend Service

```yaml
backend:
  build:
    context: ./backend
  ports:
    - "3000:3000"
  volumes:
    - pulse_db:/app/data
  environment:
    - DB_PATH=/app/data/pulse.db
    - ALLOWANCE_USD=20.00
    - ALLOWANCE_PERIOD=monthly
  networks:
    - pulse
```

**Updated code**:
- Rate limits route automatically registered in `backend/src/index.js`
- Accepts POST from proxy to `/api/rate-limits`
- Stores in shared `pulse_db` volume

### Collector Service

Already configured, no changes needed.

### Dashboard Service

Already configured, displays rate limit data automatically.

## Data Flow

1. **Claude Code** (host) → `http://localhost:8888` (port mapped from container)
2. **Proxy** (container) receives request with `traceparent` header
3. **Proxy** forwards to `api.anthropic.com` (external, works normally)
4. **Proxy** captures rate limit headers from response
5. **Proxy** sends via internal network to `http://backend:3000/api/rate-limits`
6. **Backend** (container) stores in database
7. **Dashboard** (container) queries database and displays

## Volumes

Shared volume `pulse_db` used by:
- **Collector** — writes OTEL spans
- **Backend** — reads/writes rate limits and serves queries
- **Dashboard** — reads stats

No volume needed for proxy (stateless).

## Networks

Single `pulse` bridge network allows:
- **Proxy** ↔ **Backend** (container DNS: `backend`)
- **Collector** ↔ **Backend** (via shared volume, not network)
- **Dashboard** ↔ **Backend** (via exposed port 3000, also via network)

Host machine only communicates with exposed ports:
- 8888 (proxy)
- 3000 (backend, optional if dashboard proxies requests)
- 4317/4318 (collector, if using directly)
- 80 (dashboard)

## Common Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f proxy        # Proxy logs
docker-compose logs -f backend      # Backend logs
docker-compose logs -f dashboard    # Dashboard logs

# Stop all services
docker-compose down

# Remove volumes (clean database)
docker-compose down -v

# Rebuild images
docker-compose build

# Check if proxy is listening
curl http://localhost:8888

# Check if backend is responding
curl http://localhost:3000/health

# Check if dashboard is up
curl http://localhost
```

## Troubleshooting

### "Connection refused" when Claude Code tries to connect to proxy

**Problem**: Docker services started but proxy not accessible from host

**Solution**:
```bash
# Check port is exposed
docker-compose ps
# Should show: pulse-proxy-1  0.0.0.0:8888->8888/tcp

# Check proxy is running
docker-compose logs proxy
# Should show: Anthropic API proxy listening on 0.0.0.0:8888

# Check host can reach it
curl -I http://localhost:8888
```

### "Backend endpoint not found" in proxy logs

**Problem**: Proxy can't reach backend (Docker DNS not working)

**Solution**:
```bash
# Verify both services on same network
docker-compose exec proxy ping backend
# Should work (Docker DNS resolves 'backend' hostname)

# Check docker-compose.yml
# Ensure both have: networks: - pulse
```

### Rate limits not appearing in dashboard

**Problem**: Data not flowing through complete pipeline

**Debug steps**:
```bash
# 1. Check proxy logs
docker-compose logs proxy
# Should show: [timestamp] POST /v1/messages (trace: xxx)

# 2. Check backend logs
docker-compose logs backend
# Should show: POST /api/rate-limits requests

# 3. Check database directly
docker-compose exec backend sqlite3 /app/data/pulse.db \
  "SELECT COUNT(*) FROM spans WHERE name='llm.rate_limit'"

# 4. Check if Claude Code used the proxy
# Look for requests with traceparent header in proxy logs
```

### "Proxy build context not found"

**Problem**: Dockerfile not in right location

**Solution**:
```bash
# Ensure proxy/Dockerfile exists
ls proxy/Dockerfile
# Should exist

# Ensure proxy/proxy.js exists
ls proxy/proxy.js
# Should exist
```

### Port 8888 already in use

**Problem**: Another service using port 8888

**Solution**:
```bash
# Find what's using it
lsof -i :8888  # macOS/Linux
netstat -ano | findstr :8888  # Windows

# Change port in docker-compose.yml
# Change "8888:8888" to "8889:8888"
# Then: export ANTHROPIC_BASE_URL=http://localhost:8889
```

## Environment Variables for Claude Code

**Required** (set on host, before running Claude Code):
```bash
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
export ANTHROPIC_API_KEY=sk-ant-...
```

**Not needed** (handled by Docker):
- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector is running in Docker
- Database config — backend handles it
- Port configurations — all in docker-compose.yml

## Performance

All services run on same machine/Docker daemon:
- **Latency**: Minimal (<15ms added by proxy)
- **Database**: Shared volume (SQLite WAL mode)
- **CPU**: Single-threaded services (proxy, backend), lightweight
- **Memory**: ~300MB total for all services

Suitable for:
- Development
- Testing
- Small-scale monitoring (<1000 requests/sec)

## Production Considerations

For production deployment:

1. **Persistent database**: Use PostgreSQL instead of SQLite
2. **Multiple replicas**: Use Kubernetes/Swarm for scaling
3. **Network security**: Add authentication to proxy
4. **TLS**: Add reverse proxy (nginx) for HTTPS
5. **Monitoring**: Add Prometheus/Grafana for service health
6. **Logging**: Centralize with ELK/Datadog

## Development Workflow

For local development:

```bash
# Terminal 1: Start Docker services
cd pulse
docker-compose up

# Terminal 2: Configure Claude Code
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1

# Terminal 3: Use Claude Code
claude code my-file.js

# Terminal 1: Watch proxy logs for requests
# You'll see: [2026-06-07T14:23:45.123Z] POST /v1/messages (trace: 4bf92f35)
```

## Dockerfile Details

### proxy/Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY proxy.js .

EXPOSE 8888

CMD ["node", "proxy.js"]
```

**Design choices**:
- Alpine Linux (small: 160MB vs 900MB with default)
- `--omit=dev` (production mode, no uuid dependency)
- EXPOSE 8888 (documents port, doesn't map it)
- Simple CMD (proxy.js reads env vars)

## Summary

✅ All services run in Docker  
✅ Claude Code on host connects via localhost:8888  
✅ Internal Docker networking handles service communication  
✅ Single shared database volume  
✅ Stateless proxy (can scale)  
✅ Ready for development and testing  
