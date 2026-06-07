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
      ROUND(SUM(input_cost_usd), 6) AS total_input_cost_usd,
      ROUND(SUM(output_cost_usd), 6) AS total_output_cost_usd,
      ROUND(AVG(duration_ms), 0) AS avg_duration_ms,
      MAX(duration_ms)         AS max_duration_ms,
      ROUND(AVG(rate_limit_remaining), 0) AS avg_rate_limit_remaining,
      MIN(rate_limit_remaining) AS min_rate_limit_remaining
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

  // Auto-select bucket size based on data spread
  const timeRange = db.prepare(`
    SELECT
      MIN(SUBSTR(start_time, 1, 19)) AS earliest,
      MAX(SUBSTR(start_time, 1, 19)) AS latest
    FROM spans ${where}
  `).get(params);

  const spanMs = timeRange?.earliest && timeRange?.latest
    ? new Date(timeRange.latest.replace(' ', 'T') + 'Z').getTime() - new Date(timeRange.earliest.replace(' ', 'T') + 'Z').getTime()
    : 0;
  const spanHours = spanMs / (1000 * 60 * 60);

  // start_time is stored as "2026-06-07 16:46:20.388 +0000 UTC" — strip suffix for strftime
  const t = `SUBSTR(start_time, 1, 19)`;

  // < 2h → 5-min buckets, < 48h → 1h buckets, else → 6h buckets
  const bucketExpr = spanHours < 2
    ? `strftime('%Y-%m-%dT%H:', ${t}) || printf('%02d', (CAST(strftime('%M', ${t}) AS INTEGER) / 5) * 5) || ':00Z'`
    : spanHours < 48
    ? `strftime('%Y-%m-%dT%H:00:00Z', ${t})`
    : `strftime('%Y-%m-%dT', ${t}) || printf('%02d', (CAST(strftime('%H', ${t}) AS INTEGER) / 6) * 6) || ':00:00Z'`;

  const costTimeline = db.prepare(`
    SELECT
      ${bucketExpr} AS hour,
      ROUND(SUM(cost_usd), 6)       AS cost_usd,
      ROUND(SUM(input_cost_usd), 6) AS input_cost_usd,
      ROUND(SUM(output_cost_usd), 6) AS output_cost_usd,
      SUM(input_tokens)             AS input_tokens,
      SUM(output_tokens)            AS output_tokens,
      COUNT(*)                      AS span_count,
      ROUND(AVG(duration_ms), 0)    AS avg_duration_ms,
      ROUND(AVG(rate_limit_remaining), 0) AS avg_rate_limit_remaining,
      MAX(rate_limit_remaining)     AS max_rate_limit_remaining
    FROM spans
    ${where}
    GROUP BY hour
    ORDER BY hour ASC
  `).all(params);

  // Cost breakdown by input vs output
  const costBreakdown = db.prepare(`
    SELECT
      ROUND(SUM(input_cost_usd), 6) AS input_cost_usd,
      ROUND(SUM(output_cost_usd), 6) AS output_cost_usd,
      ROUND(SUM(cost_usd), 6) AS total_cost_usd,
      CASE
        WHEN SUM(cost_usd) > 0 THEN ROUND(100.0 * SUM(input_cost_usd) / SUM(cost_usd), 2)
        ELSE 0
      END AS input_cost_percentage
    FROM spans
    ${where}
  `).get(params);

  res.json({ totals, byModel, costTimeline, costBreakdown });
});

export default router;
