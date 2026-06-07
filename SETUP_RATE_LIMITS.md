# Rate Limit Monitoring for Pulse

This guide sets up real-time rate limit tracking for the Pulse Claude API monitoring dashboard.

## What You'll Get

- **Real-time rate limit visibility**: See current token limits and remaining capacity
- **Rate limit timeline**: Track how rate limits change over time
- **Per-request tracking**: Each Claude Code request shows rate limit state at that moment
- **Cost-to-rate-limit correlation**: See how your cost spend relates to rate limit usage

## Prerequisites

- Pulse collector running (listens on localhost:4317/4318)
- Pulse backend running (listens on localhost:3000)
- Claude Code installed locally
- Node.js 18+

## Setup Steps

### 1. Start the Anthropic Proxy

```bash
cd pulse/proxy
npm start
```

You should see:
```
Anthropic API proxy listening on http://localhost:8888
Forwarding to https://api.anthropic.com
Sending rate limit data to http://127.0.0.1:3000/api/rate-limits
```

Leave this running in a terminal.

### 2. Configure Claude Code

In your shell (bash, zsh, or PowerShell), set these environment variables:

```bash
export ANTHROPIC_BASE_URL=http://localhost:8888
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1
```

**Important**: These env vars must be set **before** you run Claude Code, so set them in your shell session or add them to your shell profile.

### 3. Verify the Setup

Test that everything is wired up:

```bash
# 1. Check proxy is listening
curl -I http://localhost:8888

# 2. Check backend accepts rate limit data
curl http://localhost:3000/api/rate-limits \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"traceId":"test","rateLimitLimit":1000000,"rateLimitRemaining":999000,"rateLimitResetTime":"2026-06-08T00:00:00Z"}'
# Should return: {"spanId":"...", "traceId":"test", "inserted":true}

# 3. Run Claude Code
claude code my-file.js
```

After Claude Code runs, check the database for rate limit data:

```bash
sqlite3 pulse.db "SELECT COUNT(*) FROM spans WHERE name='llm.rate_limit';"
```

### 4. View Rate Limits in Dashboard

Open the Pulse dashboard (usually http://localhost:5173). You should see:

- **Rate Limit Status** card showing current remaining tokens
- **Rate Limit Timeline** showing how limits changed over your last requests
- Rate limit data grouped by model in the **Model Performance** section

## How It Works

1. **Claude Code** makes a request to the Anthropic API with a `traceparent` header (W3C trace context)
2. **Proxy** intercepts the request, forwards it to Anthropic, captures rate limit headers from the response
3. **Proxy** sends rate limit data to backend API with the original trace ID
4. **Backend** stores rate limit data as spans in the database, correlated by trace ID
5. **Dashboard** queries spans and displays rate limit information

### Data Flow

```
Claude Code
    ↓ (HTTP with traceparent: 00-{traceId}-{parentId}-01)
Proxy (8888)
    ├→ Forward to api.anthropic.com ✓
    └→ Capture anthropic-ratelimit-tokens-* headers
         ↓
      Backend (3000/api/rate-limits)
         ↓
      Database (pulse.db)
         ↓
      Dashboard (5173) displays rate limits
```

## Environment Variables

### For Claude Code

```bash
# Point Claude Code to the proxy
export ANTHROPIC_BASE_URL=http://localhost:8888

# Enable trace header propagation through proxy
export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1

# Keep your API key (no changes needed)
export ANTHROPIC_API_KEY=sk-ant-...
```

### For Proxy (automatic)

The proxy reads from environment automatically:
- `ANTHROPIC_API_KEY` — forwarded to Anthropic API
- `HTTP_PROXY` / `HTTPS_PROXY` — if you have a corporate proxy, it will be used

## Troubleshooting

### "Rate limit data not showing in dashboard"

Check in order:

1. **Is proxy running?**
   ```bash
   curl -I http://localhost:8888
   # Should return 502 (since Anthropic rejects headless requests)
   ```

2. **Are env vars set?**
   ```bash
   echo $ANTHROPIC_BASE_URL
   echo $CLAUDE_CODE_PROPAGATE_TRACEPARENT
   # Both should be set
   ```

3. **Did Claude Code use proxy?**
   - Check proxy logs for Claude Code requests
   - They should show with a trace ID, e.g.: `(trace: 4bf92f35)`

4. **Is rate limit data reaching backend?**
   ```bash
   # Check recent rate limit spans in DB
   sqlite3 pulse.db "SELECT COUNT(*) FROM spans WHERE name='llm.rate_limit' AND start_time > datetime('now', '-5 minutes');"
   ```

5. **Backend error?**
   - Check backend console for errors
   - Verify backend is listening: `curl http://localhost:3000/health`

### "Proxy shows 502 errors"

This is normal. The proxy legitimately returns 502 to headless requests (no API key, no User-Agent). Claude Code requests will work fine with your API key.

### "Claude Code is slow"

The proxy adds minimal latency (<10ms per request). If Claude Code is slow:
1. Check your network connection to api.anthropic.com
2. Check proxy logs for errors (should be fast)
3. Verify backend is responding to rate limit POSTs quickly

### "Trace context not propagating"

If you see `(trace: none)` in proxy logs:
1. Verify `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1` is set
2. Verify `ANTHROPIC_BASE_URL=http://localhost:8888` is set
3. Restart Claude Code (env vars must be set before launch)
4. Check Claude Code version is recent (2026-03 or later)

## Disabling Rate Limit Monitoring

To stop using the proxy and return to direct API calls:

```bash
unset ANTHROPIC_BASE_URL
unset CLAUDE_CODE_PROPAGATE_TRACEPARENT
# Claude Code will now connect directly to api.anthropic.com
```

The proxy can be stopped without affecting the dashboard (rate limit data stays in the database).

## Next Steps

- Monitor rate limit usage over time in the dashboard
- Set rate limit allowances in config (if Pulse supports it)
- Export rate limit reports for capacity planning
- Set up alerts if approaching rate limits

## Files Modified

- `proxy/proxy.js` — HTTP proxy that captures rate limits
- `backend/src/routes/rate-limits.js` — API endpoint for storing rate limits
- `backend/src/index.js` — registered rate-limits route
- `dashboard/src/pages/Overview.tsx` — already has rate limit display

## Architecture Details

See [proxy/README.md](proxy/README.md) for detailed proxy architecture.
