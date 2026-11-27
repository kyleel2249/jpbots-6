-- Persistent operator-controlled agent activation and dynamic instrument assignments.
CREATE TABLE IF NOT EXISTS agent_assignments (
  role_id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  symbol TEXT,
  timeframe TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PAUSED','ASSIGNED','AWAITING_MARKET_DATA','AWAITING_CAPABILITY','DEGRADED')),
  assignment_source TEXT,
  assigned_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(role_id) REFERENCES agent_state(role_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_division_status ON agent_assignments(division_id,status);
-- Fail closed until the operator explicitly activates the division's scanner agent.
UPDATE trading_divisions SET enabled=0,updated_at=unixepoch()*1000;
