-- Independent style-level paper allocations, performance ledgers and arbitration decisions.
CREATE TABLE IF NOT EXISTS trading_divisions (
  division_id TEXT PRIMARY KEY,
  allocation_usd REAL NOT NULL DEFAULT 0 CHECK(allocation_usd >= 0),
  max_risk_per_trade_pct REAL NOT NULL,
  max_daily_loss_pct REAL NOT NULL,
  max_open_positions INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO trading_divisions(division_id,allocation_usd,max_risk_per_trade_pct,max_daily_loss_pct,max_open_positions,enabled,updated_at)
VALUES ('scalping',2,0.35,1.5,2,1,unixepoch()*1000),('day-trading',3,0.5,2,3,1,unixepoch()*1000);
CREATE TABLE IF NOT EXISTS adaptive_trading_decisions (
  decision_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  selected_json TEXT NOT NULL,
  assessments_json TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  live_trading_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_trading_enabled=0)
);
CREATE INDEX IF NOT EXISTS idx_adaptive_decisions_symbol_time ON adaptive_trading_decisions(symbol,observed_at DESC);
CREATE TABLE IF NOT EXISTS division_performance (
  division_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  net_pnl_usd REAL,
  r_multiple REAL,
  outcome TEXT,
  source TEXT NOT NULL DEFAULT 'paper',
  PRIMARY KEY(division_id,trade_id),
  FOREIGN KEY(division_id) REFERENCES trading_divisions(division_id)
);
CREATE INDEX IF NOT EXISTS idx_division_performance_time ON division_performance(division_id,closed_at DESC);
