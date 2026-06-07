import http from 'http';
import https from 'https';
import { URL } from 'url';

const ANTHROPIC_API = 'https://api.anthropic.com';
const PROXY_PORT = process.env.PORT || 8888;
const BACKEND_ENDPOINT = process.env.BACKEND_ENDPOINT || 'http://127.0.0.1:3000/api/rate-limits';

// Parse W3C traceparent header: version-trace_id-parent_id-trace_flags
// Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
function parseTraceparent(traceparent) {
  if (!traceparent) return null;
  const parts = traceparent.split('-');
  if (parts.length !== 4) return null;
  return {
    version: parts[0],
    traceId: parts[1],
    parentId: parts[2],
    flags: parts[3],
  };
}

// Extract rate limit data from response headers
function extractRateLimitData(headers) {
  return {
    limit: parseInt(headers['anthropic-ratelimit-tokens-limit'] || '0', 10),
    remaining: parseInt(headers['anthropic-ratelimit-tokens-remaining'] || '0', 10),
    resetTime: headers['anthropic-ratelimit-tokens-reset'] || '',
  };
}

// Send rate limit data to backend API for storage
async function sendRateLimitData(traceId, rateLimitData, requestTime, responseTime) {
  const payload = {
    traceId,
    name: 'llm.rate_limit',
    startTime: new Date(requestTime).toISOString(),
    endTime: new Date(responseTime).toISOString(),
    durationMs: responseTime - requestTime,
    rateLimitLimit: rateLimitData.limit,
    rateLimitRemaining: rateLimitData.remaining,
    rateLimitResetTime: rateLimitData.resetTime,
  };

  try {
    const response = await fetch(BACKEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Backend error: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('Failed to send rate limit data:', err.message);
  }
}

// Create proxy server
const server = http.createServer((req, res) => {
  const targetUrl = new URL(req.url, ANTHROPIC_API);

  // Extract trace context from incoming request
  const traceparent = req.headers.traceparent;
  const traceContext = parseTraceparent(traceparent);
  const traceId = traceContext?.traceId;

  console.log(`[${new Date().toISOString()}] ${req.method} ${targetUrl.pathname} (trace: ${traceId?.substring(0, 8) || 'none'})`);

  const requestTime = Date.now();

  // Build options for upstream request
  const upstreamOptions = {
    hostname: new URL(ANTHROPIC_API).hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: new URL(ANTHROPIC_API).hostname,
    },
  };

  // Forward request to Anthropic API
  const upstreamReq = https.request(upstreamOptions, (upstreamRes) => {
    const responseTime = Date.now();
    const rateLimitData = extractRateLimitData(upstreamRes.headers);

    // Send rate limit data to backend if trace context exists
    if (traceId && rateLimitData.limit > 0) {
      sendRateLimitData(traceId, rateLimitData, requestTime, responseTime).catch(err => {
        console.error('Rate limit data send error:', err.message);
      });
    }

    // Forward response headers and status
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);

    // Forward response body
    upstreamRes.pipe(res);

    upstreamRes.on('error', (err) => {
      console.error('Upstream response error:', err);
      res.writeHead(502);
      res.end('Bad Gateway');
    });
  });

  // Handle upstream request errors
  upstreamReq.on('error', (err) => {
    console.error('Upstream request error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  // Forward request body
  req.pipe(upstreamReq);

  req.on('error', (err) => {
    console.error('Request error:', err);
    res.writeHead(400);
    res.end('Bad Request');
  });
});

server.listen(PROXY_PORT, 'localhost', () => {
  console.log(`Anthropic API proxy listening on http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding to ${ANTHROPIC_API}`);
  console.log(`Sending rate limit data to ${BACKEND_ENDPOINT}`);
  console.log('\nConfigure Claude Code with:');
  console.log('  export ANTHROPIC_BASE_URL=http://localhost:8888');
  console.log('  export CLAUDE_CODE_PROPAGATE_TRACEPARENT=1');
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Proxy stopped');
    process.exit(0);
  });
});
