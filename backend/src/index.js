import express from 'express';
import cors from 'cors';
import spansRouter from './routes/spans.js';
import tracesRouter from './routes/traces.js';
import statsRouter from './routes/stats.js';
import configRouter from './routes/config.js';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/spans',  spansRouter);
app.use('/api/traces', tracesRouter);
app.use('/api/stats',  statsRouter);
app.use('/api/config', configRouter);

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Pulse backend listening on :${PORT}`);
});
