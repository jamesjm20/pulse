# Anthropic API Proxy

HTTP proxy that intercepts Claude API calls and captures rate limit data as OTEL spans.

## What it does

1. Listens on `http://localhost:8888`
2. Forwards requests to `https://api.anthropic.com` unchanged
3. Extracts rate limit headers from responses: `anthropic-ratelimit-tokens-limit`, `anthropic-ratelimit-tokens-remaining`, `anthropic-ratelimit-tokens-reset`
4. Sends rate limit data to backend API (`POST /api/rate-limits`)
5. Correlates by trace ID from W3C `traceparent` header

## Setup

### 1. Install dependencies
```bash
cd proxy
npm install
```

### 2. Start the proxy
```bash
npm start
```

You should see:
```
Anthropic API proxy listening on http://localhost:8888
Forwarding to https://api.anthropic.com
Sending rate limit spans to http://127.0.0.1:4318/v1/traces

Configure Claude Code with:
  export ANTHROPIC_BASE_URL=http://localhost:8888
  export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
```

### 3. Configure Claude Code

Set these environment variables before running Claude Code:

```bash
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
```

The second variable tells Claude Code to include W3C trace headers when proxying through a custom endpoint. Without it, trace context won't be propagated.

### 4. Run Claude Code normally

```bash
# Now rate limits will be captured in Pulse
claude code my-file.js
```

## How it works

```
Claude Code
    ↓ (HTTP request with traceparent header)
Proxy (localhost:8888)
    ├→ Forwards to api.anthropic.com
    ├→ Captures response headers
    └→ Sends rate limit data to backend
            ↓
         Backend API (localhost:3000/api/rate-limits)
            ↓
         Database (pulse.db)
            ↓
         Dashboard (displays rate limit stats)
```

### Trace correlation

Each rate limit record:
- Has the same `traceId` as the original Claude Code trace
- Contains:
  - `rateLimitLimit` — max tokens per period
  - `rateLimitRemaining` — tokens remaining
  - `rateLimitResetTime` — when limit resets
  - `startTime` / `endTime` — request timing

The Pulse dashboard queries rate limit records by trace ID to correlate them with the original request spans.

## Architecture

The proxy works as part of a larger rate limit tracking system:

```
┌─────────────────────────────────────────────────────────────────┐
│  Pulse: Claude API Usage & Rate Limit Monitoring                │
└─────────────────────────────────────────────────────────────────┘

1. Claude Code (via CLI)
   └─ Makes API requests to Anthropic
      └─ Includes W3C traceparent header (trace context)

2. Anthropic Proxy (localhost:8888)
   ├─ Intercepts requests
   ├─ Forwards to api.anthropic.com
   ├─ Captures rate limit headers from response
   └─ Sends rate limit data to backend

3. Pulse Backend (localhost:3000)
   ├─ Receives rate limit data via POST /api/rate-limits
   ├─ Stores as spans in database (correlated by traceId)
   └─ Provides stats API to dashboard

4. Pulse Collector (localhost:4317/4318)
   ├─ Receives OTEL trace data from Claude Code
   ├─ Stores spans in database
   └─ Enriches with cost/token metadata

5. Pulse Dashboard
   └─ Displays cost, tokens, latency, AND rate limit status
```

## Troubleshooting

### Proxy isn't receiving traceparent headers

Check that both env vars are set:
```bash
echo $ANTHROPIC_BASE_URL        # Should be http://localhost:8888
echo $CLAUDE_CODE_PROPAGATE_TRACEPARENT  # Should be 1
```

If not set, Claude Code won't propagate trace headers through the proxy.

### Rate limit data not appearing in database

1. **Check proxy is running**: `curl -I http://localhost:8888` should work
2. **Check backend is running**: `curl http://localhost:3000/health` should return `{"status":"ok"}`
3. **Check proxy logs**: watch for "rate_limit" messages
4. **Check database directly**:
   ```bash
   sqlite3 pulse.db "SELECT COUNT(*) FROM spans WHERE name='llm.rate_limit';"
   ```
5. **Check for errors**: both proxy and backend should log errors to console

### Proxy not forwarding requests

1. Verify `ANTHROPIC_BASE_URL=http://localhost:8888` is set
2. Verify proxy is running: `curl -v http://localhost:8888/` (should show proxy headers)
3. Check your API key is still set: `echo $ANTHROPIC_API_KEY`
4. Verify Claude Code uses the proxy: add `-v` flag to see request URLs

## Logs

Proxy logs requests to stdout with timestamp, method, path, and trace ID:
```
[2026-06-07T14:23:45.123Z] POST /v1/messages (trace: 4bf92f35)
```

Watch the logs while using Claude Code to verify it's routing through the proxy and capturing rate limits:
```bash
npm start
# Terminal 1: proxy logs
```

```bash
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
claude code my-file.js
# Terminal 2: Claude Code uses proxy
```

You should see log entries in Terminal 1 for each request.
