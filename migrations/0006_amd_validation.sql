CREATE TABLE IF NOT EXISTS amd_validation_runs (
  run_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK(run_type IN ('replay','optimisation','walk-forward')),
  strategy_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amd_validation_symbol_time ON amd_validation_runs(symbol,completed_at DESC);
CREATE TABLE IF NOT EXISTS amd_forward_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  session_date TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('qualified','rejected','missed','paper-opened')),
  direction TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  reason_json TEXT NOT NULL,
  assessment_json TEXT NOT NULL,
  arbitration_json TEXT,
  paper_order_attempted INTEGER NOT NULL DEFAULT 0 CHECK(paper_order_attempted IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amd_forward_symbol_time ON amd_forward_opportunities(symbol,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_amd_forward_status_time ON amd_forward_opportunities(status,observed_at DESC);
