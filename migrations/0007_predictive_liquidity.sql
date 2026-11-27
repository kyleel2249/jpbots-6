CREATE TABLE IF NOT EXISTS predictive_liquidity_runs (
 run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, observed_at INTEGER NOT NULL,
 status TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictive_runs_symbol_time ON predictive_liquidity_runs(symbol,observed_at DESC);
CREATE TABLE IF NOT EXISTS derivatives_history (
 symbol TEXT NOT NULL, observed_at INTEGER NOT NULL, funding_rate REAL,
 open_interest REAL, mark_price REAL, index_price REAL, source TEXT NOT NULL,
 PRIMARY KEY(symbol,observed_at,source)
);
CREATE INDEX IF NOT EXISTS idx_derivatives_history_symbol_time ON derivatives_history(symbol,observed_at DESC);
CREATE TABLE IF NOT EXISTS decision_replay_events (
 run_id TEXT NOT NULL, sequence INTEGER NOT NULL, observed_at INTEGER NOT NULL,
 event_kind TEXT NOT NULL, payload_json TEXT NOT NULL, previous_hash TEXT NOT NULL,
 event_hash TEXT NOT NULL, PRIMARY KEY(run_id,sequence)
);
CREATE INDEX IF NOT EXISTS idx_replay_events_run_sequence ON decision_replay_events(run_id,sequence);
CREATE TABLE IF NOT EXISTS agent_recovery_leases (
 agent_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3,
 idempotency_key TEXT NOT NULL, last_error TEXT, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_recovery_lease_time ON agent_recovery_leases(status,lease_until);
-- Reset only the untouched starter account; never overwrite a funded or traded paper account.
UPDATE paper_accounts
SET initial_equity=5, equity=5, peak_equity=5, updated_at=unixepoch()*1000
WHERE account_id='default' AND initial_equity=10000 AND equity=10000 AND peak_equity=10000
AND open_positions=0
AND NOT EXISTS (SELECT 1 FROM paper_positions WHERE paper_positions.status IN ('open','closing','closed'))
AND NOT EXISTS (SELECT 1 FROM paper_fills);
INSERT OR IGNORE INTO paper_accounts(account_id,initial_equity,equity,peak_equity,updated_at)
VALUES('default',5,5,5,unixepoch()*1000);

CREATE TABLE IF NOT EXISTS liquidation_events (
 event_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, exchange_name TEXT NOT NULL,
 observed_at INTEGER NOT NULL, side TEXT NOT NULL CHECK(side IN ('long','short')),
 price REAL NOT NULL, quantity REAL NOT NULL, source TEXT NOT NULL,
 ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_liquidation_events_symbol_time ON liquidation_events(symbol,observed_at DESC);
