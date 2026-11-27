CREATE TABLE IF NOT EXISTS backtest_runs (
  run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, interval_name TEXT NOT NULL,
  strategy_id TEXT NOT NULL, strategy_version TEXT NOT NULL,
  started_at INTEGER NOT NULL, completed_at INTEGER NOT NULL,
  config_json TEXT NOT NULL, metrics_json TEXT NOT NULL, result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_symbol_time ON backtest_runs(symbol, completed_at DESC);
CREATE TABLE IF NOT EXISTS paper_execution_events (
  event_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL,
  event_type TEXT NOT NULL, observed_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
