import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = Router();

// POST /api/rate-limits — receive rate limit data from proxy
router.post('/', (req, res) => {
  const {
    traceId,
    name = 'llm.rate_limit',
    startTime,
    endTime,
    durationMs,
    rateLimitLimit,
    rateLimitRemaining,
    rateLimitResetTime,
  } = req.body;

  if (!traceId) {
    return res.status(400).json({ error: 'traceId required' });
  }

  const spanId = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  try {
    const result = db.prepare(`
      INSERT INTO spans
        (id, trace_id, parent_id, name, service_name, model,
         start_time, end_time, duration_ms,
         input_tokens, output_tokens, input_cost_usd, output_cost_usd, cost_usd, cost_model_version,
         rate_limit_limit, rate_limit_remaining, rate_limit_reset_tokens, attributes)
      VALUES
        (?, ?, NULL, ?, 'anthropic-proxy', NULL,
         ?, ?, ?,
         0, 0, 0, 0, 0, NULL,
         ?, ?, ?, NULL)
    `).run(
      spanId,
      traceId,
      name,
      startTime,
      endTime,
      durationMs,
      rateLimitLimit,
      rateLimitRemaining,
      rateLimitResetTime,
    );

    res.json({
      spanId,
      traceId,
      inserted: result.changes > 0,
    });
  } catch (err) {
    console.error('Failed to insert rate limit span:', err);
    res.status(500).json({ error: 'Failed to store rate limit data' });
  }
});

export default router;
