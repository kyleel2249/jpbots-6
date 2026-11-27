CREATE TABLE IF NOT EXISTS global_market_instruments (
 instrument_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, asset_class TEXT NOT NULL,
 venue TEXT NOT NULL, chain TEXT, quote_asset TEXT, price REAL, change_24h_pct REAL,
 volume_24h_usd REAL, liquidity_usd REAL, tvl_usd REAL, observed_at INTEGER NOT NULL,
 source TEXT NOT NULL, tradable INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_global_market_asset_volume ON global_market_instruments(asset_class,volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_global_market_symbol_venue ON global_market_instruments(symbol,venue);
CREATE TABLE IF NOT EXISTS global_market_scan_runs (
 run_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER,
 status TEXT NOT NULL, discovered_count INTEGER NOT NULL DEFAULT 0,
 scanned_count INTEGER NOT NULL DEFAULT 0, source_health_json TEXT NOT NULL,
 summary_json TEXT NOT NULL, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_global_market_runs_time ON global_market_scan_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS global_market_opportunities (
 opportunity_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, instrument_id TEXT NOT NULL,
 symbol TEXT NOT NULL, asset_class TEXT NOT NULL, venue TEXT NOT NULL,
 observed_at INTEGER NOT NULL, price REAL, change_24h_pct REAL, score REAL NOT NULL,
 direction TEXT NOT NULL, chart_json TEXT NOT NULL, reasons_json TEXT NOT NULL,
 source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_global_opportunities_time ON global_market_opportunities(observed_at DESC,score DESC);
CREATE INDEX IF NOT EXISTS idx_global_opportunities_asset ON global_market_opportunities(asset_class,score DESC);
