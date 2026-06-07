package store

import (
	"database/sql"
	"time"

	_ "modernc.org/sqlite"
)

// Span is the normalised unit we store from any OTEL signal.
type Span struct {
	ID          string
	TraceID     string
	ParentID    string
	Name        string
	ServiceName string
	Model       string
	StartTime   time.Time
	EndTime     time.Time
	DurationMs  int64

	// Token counts (enriched from OTEL attributes)
	InputTokens  int64
	OutputTokens int64

	// Cost in USD (enriched)
	CostUSD float64

	// Raw OTEL attributes as JSON blob
	Attributes string

	// Export state
	Exported   bool
	ExportedAt *time.Time
}

type Store struct {
	db *sql.DB
}

func New(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	// Sensible SQLite tuning for a write-heavy collector
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA synchronous=NORMAL`); err != nil {
		return nil, err
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS spans (
			id            TEXT PRIMARY KEY,
			trace_id      TEXT NOT NULL,
			parent_id     TEXT,
			name          TEXT NOT NULL,
			service_name  TEXT,
			model         TEXT,
			start_time    DATETIME NOT NULL,
			end_time      DATETIME,
			duration_ms   INTEGER,
			input_tokens  INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			cost_usd      REAL DEFAULT 0,
			attributes    TEXT,
			exported      INTEGER DEFAULT 0,
			exported_at   DATETIME,
			created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_spans_exported   ON spans(exported);
		CREATE INDEX IF NOT EXISTS idx_spans_trace_id   ON spans(trace_id);
		CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time);
	`)
	return err
}

// InsertSpan writes a single span. On conflict (same ID) it is ignored —
// OTEL retries can safely re-deliver.
func (s *Store) InsertSpan(span *Span) error {
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO spans
			(id, trace_id, parent_id, name, service_name, model,
			 start_time, end_time, duration_ms,
			 input_tokens, output_tokens, cost_usd,
			 attributes, exported)
		VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
	`,
		span.ID, span.TraceID, span.ParentID, span.Name, span.ServiceName, span.Model,
		span.StartTime, span.EndTime, span.DurationMs,
		span.InputTokens, span.OutputTokens, span.CostUSD,
		span.Attributes,
	)
	return err
}

// UnexportedSpans returns up to limit spans that haven't been sent to the backend yet.
func (s *Store) UnexportedSpans(limit int) ([]*Span, error) {
	rows, err := s.db.Query(`
		SELECT id, trace_id, parent_id, name, service_name, model,
		       start_time, end_time, duration_ms,
		       input_tokens, output_tokens, cost_usd, attributes
		FROM spans
		WHERE exported = 0
		ORDER BY start_time ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var spans []*Span
	for rows.Next() {
		sp := &Span{}
		if err := rows.Scan(
			&sp.ID, &sp.TraceID, &sp.ParentID, &sp.Name, &sp.ServiceName, &sp.Model,
			&sp.StartTime, &sp.EndTime, &sp.DurationMs,
			&sp.InputTokens, &sp.OutputTokens, &sp.CostUSD, &sp.Attributes,
		); err != nil {
			return nil, err
		}
		spans = append(spans, sp)
	}
	return spans, rows.Err()
}

// MarkExported updates the exported flag for the given span IDs.
func (s *Store) MarkExported(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	now := time.Now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`UPDATE spans SET exported = 1, exported_at = ? WHERE id = ?`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, id := range ids {
		if _, err := stmt.Exec(now, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
