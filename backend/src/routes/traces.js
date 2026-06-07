import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/traces — list traces grouped by trace_id with aggregate stats
router.get('/', (req, res) => {
  const { since, until, limit = '50', offset = '0' } = req.query;

  const spanConditions = [];
  const params = {};

  if (since) { spanConditions.push('start_time >= @since'); params.since = since; }
  if (until) { spanConditions.push('start_time <= @until'); params.until = until; }

  const where = spanConditions.length ? `WHERE ${spanConditions.join(' AND ')}` : '';
  params.limit  = Math.min(parseInt(limit, 10), 200);
  params.offset = parseInt(offset, 10);

  const traces = db.prepare(`
    SELECT
      trace_id,
      MIN(start_time)                   AS started_at,
      MAX(end_time)                     AS ended_at,
      SUM(duration_ms)                  AS total_duration_ms,
      SUM(input_tokens)                 AS total_input_tokens,
      SUM(output_tokens)                AS total_output_tokens,
      ROUND(SUM(cost_usd), 6)           AS total_cost_usd,
      COUNT(*)                          AS span_count,
      GROUP_CONCAT(DISTINCT model)      AS models,
      GROUP_CONCAT(DISTINCT service_name) AS services
    FROM spans
    ${where}
    GROUP BY trace_id
    ORDER BY started_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params);

  res.json({ traces });
});

// GET /api/traces/expensive — top expensive traces
router.get('/expensive', (req, res) => {
  const { limit = '10' } = req.query;
  const params = { limit: Math.min(parseInt(limit, 10), 50) };

  const traces = db.prepare(`
    SELECT
      trace_id,
      MIN(start_time)                   AS started_at,
      MAX(end_time)                     AS ended_at,
      SUM(duration_ms)                  AS total_duration_ms,
      SUM(input_tokens)                 AS total_input_tokens,
      SUM(output_tokens)                AS total_output_tokens,
      ROUND(SUM(cost_usd), 6)           AS total_cost_usd,
      COUNT(*)                          AS span_count,
      GROUP_CONCAT(DISTINCT model)      AS models,
      GROUP_CONCAT(DISTINCT service_name) AS services
    FROM spans
    GROUP BY trace_id
    ORDER BY total_cost_usd DESC
    LIMIT @limit
  `).all(params);

  res.json({ traces });
});

// GET /api/traces/:traceId — all spans within a trace
router.get('/:traceId', (req, res) => {
  const spans = db.prepare(
    'SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time ASC'
  ).all(req.params.traceId);

  if (spans.length === 0) return res.status(404).json({ error: 'trace not found' });
  res.json({ spans });
});

export default router;
