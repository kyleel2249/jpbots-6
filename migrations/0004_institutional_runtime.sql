CREATE TABLE IF NOT EXISTS institutional_analyses (
  analysis_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, observed_at INTEGER NOT NULL,
  source TEXT NOT NULL, result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_institutional_analysis_symbol_time ON institutional_analyses(symbol, observed_at DESC);
CREATE TABLE IF NOT EXISTS agent_messages (
  message_id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, from_role TEXT NOT NULL,
  to_role TEXT NOT NULL, message_type TEXT NOT NULL, created_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_correlation ON agent_messages(correlation_id, created_at);
CREATE TABLE IF NOT EXISTS agent_task_leases (
  task_id TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_leases_expiry ON agent_task_leases(lease_until);
CREATE TABLE IF NOT EXISTS agent_evidence (
  evidence_id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, role_id TEXT NOT NULL,
  observed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, confidence REAL NOT NULL,
  stance TEXT NOT NULL, evidence_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_evidence_correlation ON agent_evidence(correlation_id, observed_at);
CREATE TABLE IF NOT EXISTS paper_strategy_runs (
  run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, strategy_id TEXT NOT NULL,
  status TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER,
  analysis_json TEXT NOT NULL, decision_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_strategy_runs_time ON paper_strategy_runs(started_at DESC);
