import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/config — returns allowance config and user info extracted from spans
router.get('/', (_req, res) => {
  const allowanceUsd = parseFloat(process.env.ALLOWANCE_USD || '0');
  const allowancePeriod = process.env.ALLOWANCE_PERIOD || 'monthly';

  // Extract user info from the most recent span with user.email in attributes
  const recentSpan = db.prepare(`
    SELECT attributes FROM spans
    WHERE attributes LIKE '%user.email%'
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  let user = null;
  if (recentSpan?.attributes) {
    try {
      const attrs = JSON.parse(recentSpan.attributes);
      user = {
        email: attrs['user.email'] || null,
        account_id: attrs['user.account_id'] || null,
      };
    } catch {}
  }

  res.json({ allowance_usd: allowanceUsd, allowance_period: allowancePeriod, user });
});

export default router;
