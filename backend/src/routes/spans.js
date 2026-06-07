import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Collector sends Go struct field names (PascalCase, no json tags)
const insert = db.prepare(`
  INSERT OR IGNORE INTO spans
    (id, trace_id, parent_id, name, service_name, model,
     start_time, end_time, duration_ms,
     input_tokens, output_tokens, input_cost_usd, output_cost_usd, cost_usd, cost_model_version,
     rate_limit_limit, rate_limit_remaining, rate_limit_reset_tokens, attributes)
  VALUES
    (@id, @traceId, @parentId, @name, @serviceName, @model,
     @startTime, @endTime, @durationMs,
     @inputTokens, @outputTokens, @inputCostUsd, @outputCostUsd, @costUsd, @costModelVersion,
     @rateLimitLimit, @rateLimitRemaining, @rateLimitResetTokens, @attributes)
`);

const insertBatch = db.transaction((spans) => {
  let count = 0;
  for (const sp of spans) {
    const result = insert.run({
      id:                  sp.ID,
      traceId:             sp.TraceID,
      parentId:            sp.ParentID || null,
      name:                sp.Name,
      serviceName:         sp.ServiceName || null,
      model:               sp.Model || null,
      startTime:           sp.StartTime,
      endTime:             sp.EndTime || null,
      durationMs:          sp.DurationMs,
      inputTokens:         sp.InputTokens,
      outputTokens:        sp.OutputTokens,
      inputCostUsd:        sp.InputCostUSD || 0,
      outputCostUsd:       sp.OutputCostUSD || 0,
      costUsd:             sp.CostUSD,
      costModelVersion:    sp.CostModelVersion || null,
      rateLimitLimit:      sp.RateLimitLimit || 0,
      rateLimitRemaining:  sp.RateLimitRemaining || 0,
      rateLimitResetTokens: sp.RateLimitResetTokens || null,
      attributes:          sp.Attributes || null,
    });
    count += result.changes;
  }
  return count;
});

// POST /api/spans — receive batch from collector
router.post('/', (req, res) => {
  const { spans } = req.body;
  if (!Array.isArray(spans) || spans.length === 0) {
    return res.status(400).json({ error: 'spans array required' });
  }
  const inserted = insertBatch(spans);
  res.json({ received: spans.length, inserted });
});

// GET /api/spans — list spans with optional filters
router.get('/', (req, res) => {
  const {
    trace_id,
    service_name,
    model,
    since,
    until,
    limit = '100',
    offset = '0',
  } = req.query;

  const conditions = [];
  const params = {};

  if (trace_id)    { conditions.push('trace_id = @trace_id');       params.trace_id = trace_id; }
  if (service_name){ conditions.push('service_name = @service_name'); params.service_name = service_name; }
  if (model)       { conditions.push('model = @model');              params.model = model; }
  if (since)       { conditions.push('start_time >= @since');        params.since = since; }
  if (until)       { conditions.push('start_time <= @until');        params.until = until; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.limit  = Math.min(parseInt(limit, 10), 500);
  params.offset = parseInt(offset, 10);

  const spans = db.prepare(
    `SELECT * FROM spans ${where} ORDER BY start_time DESC LIMIT @limit OFFSET @offset`
  ).all(params);

  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM spans ${where}`).get(params);

  res.json({ spans, total: count });
});

// GET /api/spans/:id — single span
router.get('/:id', (req, res) => {
  const span = db.prepare('SELECT * FROM spans WHERE id = ?').get(req.params.id);
  if (!span) return res.status(404).json({ error: 'span not found' });
  res.json(span);
});

export default router;
