CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, source TEXT NOT NULL,
  timeframe TEXT NOT NULL, observed_at INTEGER NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time ON market_snapshots(symbol, observed_at DESC);
CREATE TABLE IF NOT EXISTS orderbook_snapshots (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, source TEXT NOT NULL,
  observed_at INTEGER NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orderbook_symbol_time ON orderbook_snapshots(symbol, observed_at DESC);
CREATE TABLE IF NOT EXISTS scan_decisions (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, observed_at INTEGER NOT NULL,
  market_regime TEXT NOT NULL, direction TEXT NOT NULL, decision TEXT NOT NULL,
  blockers_json TEXT NOT NULL, report_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_decisions_symbol_time ON scan_decisions(symbol, observed_at DESC);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL, task_type TEXT NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL, result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_time ON agent_tasks(status, created_at);
CREATE TABLE IF NOT EXISTS agent_state (
  role_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'REGISTERED', heartbeat_at INTEGER,
  last_error TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_accounts (
  account_id TEXT PRIMARY KEY, equity REAL NOT NULL DEFAULT 0,
  peak_equity REAL NOT NULL DEFAULT 0, daily_loss_pct REAL NOT NULL DEFAULT 0,
  weekly_loss_pct REAL NOT NULL DEFAULT 0, monthly_loss_pct REAL NOT NULL DEFAULT 0,
  open_positions INTEGER NOT NULL DEFAULT 0, correlated_exposure_pct REAL NOT NULL DEFAULT 0,
  leverage REAL NOT NULL DEFAULT 0, margin_utilisation_pct REAL NOT NULL DEFAULT 0,
  exchange_healthy INTEGER NOT NULL DEFAULT 0, data_fresh INTEGER NOT NULL DEFAULT 0,
  reconciled INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_memory (
  trade_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, exchange_name TEXT NOT NULL,
  strategy TEXT NOT NULL, agent_role TEXT NOT NULL, regime TEXT NOT NULL,
  entry_price REAL NOT NULL, stop_price REAL NOT NULL, target_price REAL NOT NULL,
  quantity REAL NOT NULL, fees REAL NOT NULL DEFAULT 0, funding REAL NOT NULL DEFAULT 0,
  slippage REAL NOT NULL DEFAULT 0, gross_pnl REAL, net_pnl REAL,
  opened_at INTEGER NOT NULL, closed_at INTEGER, exit_reason TEXT,
  strategy_version TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_versions (
  strategy_id TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL,
  config_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(strategy_id, version)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, actor TEXT NOT NULL,
  created_at INTEGER NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(created_at DESC);
