import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'pulse.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS spans (
    id            TEXT PRIMARY KEY,
    trace_id      TEXT NOT NULL,
    parent_id     TEXT,
    name          TEXT NOT NULL,
    service_name  TEXT,
    model         TEXT,
    start_time    TEXT NOT NULL,
    end_time      TEXT,
    duration_ms   INTEGER,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd      REAL DEFAULT 0,
    attributes    TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_spans_trace_id   ON spans(trace_id);
  CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time);
  CREATE INDEX IF NOT EXISTS idx_spans_model      ON spans(model);
  CREATE INDEX IF NOT EXISTS idx_spans_service    ON spans(service_name);
`);

export default db;
