import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { since, until } = req.query;

  const conditions = [];
  const params = {};

  if (since) { conditions.push('start_time >= @since'); params.since = since; }
  if (until) { conditions.push('start_time <= @until'); params.until = until; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT trace_id) AS trace_count,
      COUNT(*)                 AS span_count,
      SUM(input_tokens)        AS total_input_tokens,
      SUM(output_tokens)       AS total_output_tokens,
      ROUND(SUM(cost_usd), 6)  AS total_cost_usd,
      ROUND(AVG(duration_ms), 0) AS avg_duration_ms,
      MAX(duration_ms)         AS max_duration_ms
    FROM spans
    ${where}
  `).get(params);

  const byModel = db.prepare(`
    SELECT
      COALESCE(model, 'unknown')  AS model,
      COUNT(*)                    AS span_count,
      SUM(input_tokens)           AS input_tokens,
      SUM(output_tokens)          AS output_tokens,
      ROUND(SUM(cost_usd), 6)     AS cost_usd,
      ROUND(AVG(duration_ms), 0)  AS avg_duration_ms,
      ROUND(SUM(output_tokens) / NULLIF(SUM(input_tokens), 0), 3) AS token_efficiency
    FROM spans
    ${where}
    GROUP BY model
    ORDER BY cost_usd DESC
  `).all(params);

  const costTimeline = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z', start_time) AS hour,
      ROUND(SUM(cost_usd), 6)   AS cost_usd,
      SUM(input_tokens)         AS input_tokens,
      SUM(output_tokens)        AS output_tokens,
      COUNT(*)                  AS span_count,
      ROUND(AVG(duration_ms), 0) AS avg_duration_ms
    FROM spans
    ${where}
    GROUP BY hour
    ORDER BY hour ASC
  `).all(params);

  res.json({ totals, byModel, costTimeline });
});

export default router;
