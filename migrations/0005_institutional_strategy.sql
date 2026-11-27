CREATE TABLE IF NOT EXISTS institutional_strategy_runs (
 run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, mode TEXT NOT NULL,
 strategy_version TEXT NOT NULL, created_at INTEGER NOT NULL,
 result_json TEXT NOT NULL, qualification_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_institutional_strategy_runs_symbol_time ON institutional_strategy_runs(symbol,created_at DESC);
CREATE TABLE IF NOT EXISTS strategy_qualification_evidence (
 evidence_id TEXT PRIMARY KEY, strategy_id TEXT NOT NULL, version TEXT NOT NULL,
 stage TEXT NOT NULL, passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 metrics_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strategy_qualification ON strategy_qualification_evidence(strategy_id,version,created_at DESC);
