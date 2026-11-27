-- Isolated paper capital, positions and execution records for each trading division.
CREATE TABLE IF NOT EXISTS division_paper_accounts (
  division_id TEXT PRIMARY KEY,
  initial_equity REAL NOT NULL CHECK(initial_equity >= 0),
  equity REAL NOT NULL CHECK(equity >= 0),
  peak_equity REAL NOT NULL CHECK(peak_equity >= 0),
  daily_loss_pct REAL NOT NULL DEFAULT 0,
  day_key TEXT,
  day_start_equity REAL,
  open_positions INTEGER NOT NULL DEFAULT 0 CHECK(open_positions >= 0),
  reserved_notional REAL NOT NULL DEFAULT 0 CHECK(reserved_notional >= 0),
  reserved_risk_cash REAL NOT NULL DEFAULT 0 CHECK(reserved_risk_cash >= 0),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(division_id) REFERENCES trading_divisions(division_id)
);
INSERT OR IGNORE INTO division_paper_accounts(division_id,initial_equity,equity,peak_equity,updated_at)
SELECT division_id,allocation_usd,allocation_usd,allocation_usd,unixepoch()*1000 FROM trading_divisions;
CREATE TABLE IF NOT EXISTS division_paper_positions (
  position_id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side='long'),
  quantity REAL NOT NULL CHECK(quantity>0),
  entry_price REAL NOT NULL CHECK(entry_price>0),
  stop_price REAL NOT NULL CHECK(stop_price>0),
  target_price REAL NOT NULL CHECK(target_price>entry_price),
  entry_fee REAL NOT NULL DEFAULT 0,
  risk_pct REAL NOT NULL,
  strategy_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','closing','closed')),
  closing_since INTEGER,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  exit_price REAL,
  exit_fee REAL,
  gross_pnl REAL,
  net_pnl REAL,
  exit_reason TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(division_id) REFERENCES division_paper_accounts(division_id)
);
CREATE INDEX IF NOT EXISTS idx_division_positions_open ON division_paper_positions(division_id,status,opened_at);
CREATE INDEX IF NOT EXISTS idx_division_positions_symbol ON division_paper_positions(symbol,status);
CREATE TABLE IF NOT EXISTS division_paper_fills (
  fill_id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  division_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy','sell')),
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  fee REAL NOT NULL,
  slippage_bps REAL,
  created_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(position_id) REFERENCES division_paper_positions(position_id)
);
CREATE INDEX IF NOT EXISTS idx_division_fills_position_time ON division_paper_fills(position_id,created_at);
CREATE INDEX IF NOT EXISTS idx_division_performance_closed ON division_performance(division_id,closed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_division_one_open_symbol ON division_paper_positions(division_id,symbol) WHERE status IN ('open','closing');

CREATE INDEX IF NOT EXISTS idx_division_position_monitor ON division_paper_positions(status,closing_since,symbol);
