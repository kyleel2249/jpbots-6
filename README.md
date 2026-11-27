# JP Bots 6

JP Bots 6 is an independent multi-agent trading platform. It is not an extension, fork, rename or modification of ETI/JPTI.

## Registered organisation

The primary organisation is deliberately kept at **13 departments and exactly 174 specialist role definitions**:

| Department | Roles |
|---|---:|
| Market Intelligence | 16 |
| Scalping | 12 |
| Day Trading | 12 |
| Elite Trader Replication | 21 |
| Capital Protection | 13 |
| Signal Intelligence | 15 |
| Strategy Intelligence & Evolution | 10 |
| Advanced Trading Intelligence 2.0 | 20 |
| Backtesting & Validation | 11 |
| Trade Execution | 15 |
| Position Management | 12 |
| Solana Token Intelligence | 5 |
| Institutional Intelligence | 12 |
| **Total** | **174** |

Five cross-cutting capabilities are catalogued as shared platform service domains rather than extra departments or role-count inflation: Order Book & Market Depth Intelligence; Portfolio Allocation Intelligence; AI Learning, Memory & Performance; Agent Collaboration & Orchestration; and Failure Prevention & Incident Response.

The catalogue includes 10 scalping bots, 10 day-trading bots and 20 advanced strategy bot definitions (40 total). Registered agents and bot definitions are not the same as running autonomous workers.

## AMD session strategy\n\nThe AMD strategy is an additional session-gated institutional setup, not a replacement for other strategies. Its source image specifies 03:00–06:00 accumulation (strict no-entry), 06:00–09:00 manipulation (strict no-entry), and 09:00–12:00 distribution (only entry window). During distribution it requires CISD or MSS confirmation plus either a sweep of the manipulation high/low or a retest of a strong Premium/Discount array formed during manipulation. The engine exposes session ranges, sweep flags, CISD/MSS state, qualified PD Arrays and candidate entry zones. `AMD_SESSION_TIMEZONE` defaults to `UTC` in `wrangler.toml` because the source image does not specify a timezone; configure it to the intended market-session timezone before enabling paper entries. Outside the distribution window, or without the full confirmation chain, the AMD gate blocks paper entries.\n\n## Implemented backend foundation

- **Cloudflare Worker API** in `backend/worker.ts`, deployed separately from the Vite/Pages dashboard.
- **Cloudflare D1** migrations for market snapshots, order-book snapshots, scan decisions, agent tasks/state, portfolio account state, trade memory, strategy versions, audit events, backtest runs and paper-execution event records.
- **Durable Object orchestration queue** with persistent queued tasks and alarm-driven processing.
- **Scheduled market scanning** every minute for BTCUSDT, ETHUSDT and SOLUSDT. The queue runs the market scanner and institutional analysis pipeline independently of the browser tab, then fans institutional findings out to ten institutional role tasks per symbol.
- **Real Binance Spot public REST data** for 24-hour tickers, OHLCV candles, order-book depth and aggregate trades. The scanner calculates 1m EMA/RSI and 5m/15m/1h/4h EMA alignment, builds a structured market report and evaluates order-book evidence.
- **Real DexScreener token-pair lookup** for a supplied Solana token mint. This is read-only lookup, not a complete new-pair stream or DEX execution adapter.
- **Historical research backtesting** using Binance candles and a legacy EMA crossover baseline. The institutional engine separately provides 5m/15m/1h/4h trend alignment, FVG retracement entries, swing/ATR stops, cost-adjusted targets, conservative historical replay, rolling walk-forward folds and a final untouched 20% out-of-sample segment. The replay includes fee, slippage, spread and impact assumptions and resolves same-candle stop/target collisions conservatively by assuming the stop is hit first.
- **Shared intelligence and risk primitives** for order-book imbalance, weighted imbalance, cumulative depth, microprice, trade imbalance, market reports, evidence arbitration, capital veto, trader qualification, portfolio stress and deployment qualification.
- **Persistent paper execution ledger** with a clearly separate simulated account, risk-based spot-long sizing, ask/bid depth consumption, partial-fill rejection, fee/slippage accounting, stop/target validation, position close accounting and audit events. The initial paper balance is simulated USD 10,000, not real funds. The simulator currently supports spot-long paper positions only.
- **Optional Workers AI specialist councils** that run a department's registered specialist roles against a supplied live market snapshot, validate exact role names and structured findings, mark missing evidence as incomplete, and persist every result. User-facing reports are plain-language summaries; structured formats remain internal for validation. AI inference is disabled by default and is never an execution authority.\n- **Institutional Intelligence Department** with ten existing market-evidence specialists plus two AMD specialists: Session Phase Intelligence and CISD & Market Structure Shift Intelligence. It covers order flow, liquidity pools, whale-sized public trades, order-book imbalance, estimated volume profile and auction state, accumulation/distribution proxies, liquidity sweeps, execution footprints, market-maker stress proxies, positioning/sentiment proxies, session phase classification, structural confirmation and manipulation-phase PD Arrays. The engine maps FVGs, candidate liquidity zones and nearby entry zones; every output carries evidence confidence, provenance and explicit limitations.\n- **Persistent specialist task workflow** assigns ten institutional role tasks to the Durable Object queue, records evidence and inter-agent messages in D1, updates role state, retries failed tasks, and invokes a supervisory evidence arbiter after the specialist evidence set completes. The supervisor writes an analysis-only paper strategy workflow record; it does not bypass strategy, multi-timeframe, execution-economics or capital approval gates.
- **Dashboard market prices** now come from the backend API. Synthetic random price movement, fabricated ticker changes, synthetic paper P&L and fake agent activity were removed. Account equity remains unconfigured until a reconciled account source exists.

### Backend API surface

- `GET /health`, `GET /api/providers`, `GET /api/registry`, `GET /api/agents`
- `GET /api/agent-tasks`, `GET /api/decisions`, `GET /api/audit`, `GET /api/portfolio`
- `GET /api/market/tickers`, `GET /api/market/klines`, `GET /api/market/depth`
- `GET /api/market/bitget/tickers` for public Bitget Spot/Margin-reference and futures-category tickers
- `GET /api/solana/new-pools` and `GET /api/solana/pairs?token=...`
- `POST /api/scan`, `POST /api/backtest`, and `GET /api/backtests`
- `GET /api/ai/status`, `POST /api/agents/analyse` (one department per explicit request; requires Workers AI enabled; human-readable report response)\n- `POST /api/institutional/analyse` (run the ten specialist institutional assessments and enqueue persistent role tasks)\n- `GET /api/institutional/latest?symbol=BTCUSDT`, `GET /api/institutional/analyses`
- `POST /api/institutional/strategy/run` (4-timeframe plan, AMD session assessment, historical replay, rolling walk-forward, untouched OOS, cost model and opt-in automatic paper entry)
- Scheduled institutional paper strategy scans run every five minutes only when the Worker variable `AUTO_PAPER_ENABLED=true`; it defaults to false.
- `GET /api/institutional/strategy/latest?symbol=BTCUSDT`\n- `GET /api/runtime/status` (task, evidence, messaging and supervisor workflow counts)
- `GET /api/paper/account`, `GET /api/paper/positions`, `GET /api/paper/fills`
- `POST /api/paper/orders` (requires `mode: "paper"` and `side: "long"`), `POST /api/paper/positions/:id/close`

### Department runtime coverage

The registry API reports handler coverage explicitly. Institutional Intelligence has ten independently addressable market-evidence role-task handlers; the two AMD specialists are evaluated by the AMD session engine, persisted assignments, evidence records, inter-agent messages and a supervisory arbiter. These handlers operate on the same validated market snapshot, so they are independent task executions but not independent exchange data collectors or separate always-on processes. Other departments remain registered or share existing analytical services; do not interpret the role catalogue as proof that all 172 roles are continuously running.

## Local development

Requirements: Node.js 22+ and npm.

1. Install the exact locked dependencies: `npm ci`.
2. Apply the local D1 schema: `npm run db:local`.
3. Start the Worker in one terminal: `npm run dev:backend`.
4. Start the dashboard in another terminal: `npm run dev`.
5. Verify: `npm run test`, `npm run build`, `npm run typecheck:worker`, and `npm run db:local`.

Vite proxies `/api` to the local Worker at `127.0.0.1:8787`.

## Cloudflare deployment

1. The Worker is configured for the supplied D1 database `jpbots-6_db` and ID `cb74859a-b5a2-4347-9249-2de75b4369df` under account `08c532bd849cab6fbecdffbdf1718aa9`.
2. Apply remote migrations with `npm run db:remote`.
3. The `jpbots-6_KV` namespace is bound as `KV_BINDING` in `wrangler.toml` using namespace ID `4db9e3faff394ca483a7592c6d71a14c`. The Worker uses it to cache the latest institutional strategy snapshot for 24 hours; D1 remains the durable audit/history store.
4. Deploy the backend Worker: `npm run deploy:backend`.
5. Deploy the Vite dashboard to Cloudflare Pages with build command `npm run build` and output directory `dist`.
6. Configure a Cloudflare Pages Service Binding named `API_WORKER` pointing to the deployed Worker service `jp-bots-6-backend`. The Pages Function under `functions/api/[[path]].ts` proxies dashboard API calls to that binding.

The Worker must not be deployed until remote migrations have completed and the required KV namespace binding has been configured. Live exchange execution remains disabled.
 
## Decision and safety boundaries

**Capital protection is the final authority.** The decision path is market intelligence → strategy/signal validation → independent evidence arbitration → capital protection → execution eligibility. Agent consensus cannot override a risk veto.

- The scheduled market scanner produces observations and risk-gated assessments. The separate institutional strategy workflow can create paper entries every five minutes only when `AUTO_PAPER_ENABLED=true`; this safety switch defaults to false and the paper engine remains Spot-long only.
- Institutional strategy proposals now calculate multi-timeframe FVG entries, swing/ATR invalidation stops, cost-adjusted targets and risk-sized quantities. A proposal is not an order; automatic paper entries require explicit `autoPaper: true`, a valid long setup, near-market price geometry, fresh executable depth and paper-account capital approval.
- No primary account is configured or reconciled. The capital authority therefore blocks entries by default.
- Live trading is hard-disabled. No private exchange credentials, Bitget order execution adapter, margin/futures order adapter, Solana DEX swap adapter or withdrawal capability is connected. Bitget public market-data endpoints do not imply trading support.
- Macro/news providers and source-trader discovery providers are not configured. The API reports these as unavailable instead of fabricating results.
- The queue now supports market scans and persistent institutional specialist tasks. It does **not** mean 174 independent always-on AI processes are deployed. The ten institutional handlers are independently addressable task executions on shared market evidence; the other departments still require their own tested handlers, providers, persistence and health monitoring.
- The institutional strategy replay is research-only and still requires broader market regimes, more symbols, longer histories, realistic venue-specific queue/partial-fill data, and paper forward testing. It does not model futures funding, leverage, margin, liquidation or private-exchange execution. It does not yet model strategy-specific stops, partial fills or risk-based sizing. Backtest success never enables live trading.
- Paper execution now has a separate D1-backed simulated account and position/fill ledger. It sizes spot-long entries from stop distance and the configured paper risk cap, simulates fills against visible Binance Spot order-book depth, rejects stale data, insufficient depth, excessive slippage and poor net reward/risk, and accounts for entry/exit fees. Open paper positions are checked against stop and target levels during scheduled/manual market scans. Paper entries can be requested through the institutional strategy API or scheduled automatically when `AUTO_PAPER_ENABLED=true`. The scheduled strategy worker is disabled by default; no paper entry is created unless its switch is explicitly enabled and the plan, price geometry, fresh order book and capital checks pass. The default USD 10,000 paper balance is simulated and is not connected to an exchange account.
- Workers AI is bound through Wrangler but inference is disabled by default (`AI_ENABLED=false`). Set the Worker secret `OPERATOR_API_TOKEN` with `npx wrangler secret put OPERATOR_API_TOKEN`, then set `AI_ENABLED=true` in Worker variables only after reviewing Cloudflare account usage and model costs. The analysis endpoint requires `Authorization: Bearer <OPERATOR_API_TOKEN>` to prevent unauthorised inference usage. `POST /api/agents/analyse` runs one department council at a time; the model produces advisory role findings, not 162 independent always-on AI processes. Findings are validated and persisted, but they cannot authorize orders. Cloudflare documents that Workers AI inference incurs usage charges, including local development.
- Institutional analytics use public Binance Spot REST candles, depth and aggregate trades. Whale-sized trades are sample-relative outliers and do not identify the beneficial owner. Volume profile is approximated from candle typical-price volume, not true exchange tick-level volume-at-price. Liquidity pools are repeated swing levels, not verified resting orders. Accumulation, execution footprint, market-maker behaviour and positioning are probabilistic public-data proxies. No spoofing or hidden parent-order claim is made.\n- FVG, liquidity and entry zones are candidate levels, not guaranteed fills or order instructions. The supervisor currently records blocked paper workflows because a separately qualified institutional strategy, aligned multi-timeframe confirmation, execution-cost validation and reconciled capital approval are not yet connected. The autonomous paper workflow therefore does not open positions at this stage.\n- Binance and DexScreener integrations are public read-only HTTP data sources. There is no continuous WebSocket order-book stream yet.
- Never treat illustrative configuration defaults, missing account data or unavailable provider data as verified live facts.

The platform must remain selective: no trade is preferable to an unverified trade. No architecture can guarantee profits; measure all strategy performance net of fees, spread, funding, slippage and execution impact.

Never commit API keys, seed phrases, private keys or exchange secrets.
