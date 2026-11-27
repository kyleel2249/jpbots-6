CREATE TABLE IF NOT EXISTS paper_accounts (
  account_id TEXT PRIMARY KEY, initial_equity REAL NOT NULL, equity REAL NOT NULL,
  peak_equity REAL NOT NULL, daily_loss_pct REAL NOT NULL DEFAULT 0,
  weekly_loss_pct REAL NOT NULL DEFAULT 0, monthly_loss_pct REAL NOT NULL DEFAULT 0,
  open_positions INTEGER NOT NULL DEFAULT 0, day_key TEXT, day_start_equity REAL,
  week_key TEXT, week_start_equity REAL, month_key TEXT, month_start_equity REAL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO paper_accounts(account_id,initial_equity,equity,peak_equity,updated_at)
VALUES('default',10000,10000,10000,unixepoch() * 1000);

CREATE TABLE IF NOT EXISTS paper_positions (
  position_id TEXT PRIMARY KEY, symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side = 'long'), quantity REAL NOT NULL,
  entry_price REAL NOT NULL, stop_price REAL NOT NULL, target_price REAL NOT NULL,
  entry_fee REAL NOT NULL, risk_pct REAL NOT NULL, strategy TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','closing','closed')),
  opened_at INTEGER NOT NULL, closed_at INTEGER, exit_price REAL, exit_fee REAL,
  gross_pnl REAL, net_pnl REAL, exit_reason TEXT, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_status_symbol ON paper_positions(status,symbol,opened_at);
CREATE TABLE IF NOT EXISTS paper_fills (
  fill_id TEXT PRIMARY KEY, position_id TEXT NOT NULL, symbol TEXT NOT NULL,
  side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, fee REAL NOT NULL,
  slippage_bps REAL, created_at INTEGER NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_fills_position_time ON paper_fills(position_id,created_at);
