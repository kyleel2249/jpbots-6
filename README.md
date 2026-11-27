# JP Bots 6

JP Bots 6 is an independent multi-agent trading platform. It is not an extension, fork, rename or modification of ETI/JPTI.

## Registered organisation

The primary organisation is deliberately kept at **13 departments and exactly 172 specialist role definitions**:

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
| **Total** | **162** |

Five cross-cutting capabilities are catalogued as shared platform service domains rather than extra departments or role-count inflation: Order Book & Market Depth Intelligence; Portfolio Allocation Intelligence; AI Learning, Memory & Performance; Agent Collaboration & Orchestration; and Failure Prevention & Incident Response.

The catalogue includes 10 scalping bots, 10 day-trading bots and 19 advanced strategy bot definitions (39 total). Registered agents and bot definitions are not the same as running autonomous workers.

## Implemented backend foundation

- **Cloudflare Worker API** in `backend/worker.ts`, deployed separately from the Vite/Pages dashboard.
- **Cloudflare D1** migrations for market snapshots, order-book snapshots, scan decisions, agent tasks/state, portfolio account state, trade memory, strategy versions, audit events, backtest runs and paper-execution event records.
- **Durable Object orchestration queue** with persistent queued tasks and alarm-driven processing.
- **Scheduled market scanning** every minute for BTCUSDT, ETHUSDT and SOLUSDT. The queue runs a real public-feed scanner independently of the browser tab.
- **Real Binance Spot public REST data** for 24-hour tickers, OHLCV candles, order-book depth and aggregate trades. The scanner calculates 1m EMA/RSI and 5m/15m/1h/4h EMA alignment, builds a structured market report and evaluates order-book evidence.
- **Real DexScreener token-pair lookup** for a supplied Solana token mint. This is read-only lookup, not a complete new-pair stream or DEX execution adapter.
- **Historical backtesting API** using Binance candles and a spot long-only EMA crossover research strategy. Fills are modelled at the next candle open; configurable fee and slippage assumptions are applied on entry and exit; intratrade favourable/adverse excursions and drawdown are marked using candle highs/lows; results include net P&L, win rate, profit factor, expectancy and a 70/30 in-sample/out-of-sample split.
- **Shared intelligence and risk primitives** for order-book imbalance, weighted imbalance, cumulative depth, microprice, trade imbalance, market reports, evidence arbitration, capital veto, trader qualification, portfolio stress and deployment qualification.
- **Persistent paper execution ledger** with a clearly separate simulated account, risk-based spot-long sizing, ask/bid depth consumption, partial-fill rejection, fee/slippage accounting, stop/target validation, position close accounting and audit events. The initial paper balance is simulated USD 10,000, not real funds. The simulator currently supports spot-long paper positions only.
- **Optional Workers AI specialist councils** that run a department's registered specialist roles against a supplied live market snapshot, validate exact role names and structured findings, mark missing evidence as incomplete, and persist every result. User-facing reports are plain-language summaries; structured formats remain internal for validation. AI inference is disabled by default and is never an execution authority.\n- **Institutional Intelligence Department** with ten specialist handlers covering order flow, liquidity pools, whale-sized public trades, order-book imbalance, estimated volume profile and auction state, accumulation/distribution proxies, liquidity sweeps, execution footprints, market-maker stress proxies, and positioning/sentiment proxies. The engine maps FVGs, candidate liquidity zones and nearby entry zones; every output carries evidence confidence, provenance and explicit limitations.\n- **Persistent specialist task workflow** assigns ten institutional role tasks to the Durable Object queue, records evidence and inter-agent messages in D1, updates role state, retries failed tasks, and invokes a supervisory evidence arbiter after the specialist evidence set completes. The supervisor writes an analysis-only paper strategy workflow record; it does not bypass strategy, multi-timeframe, execution-economics or capital approval gates.
- **Dashboard market prices** now come from the backend API. Synthetic random price movement, fabricated ticker changes, synthetic paper P&L and fake agent activity were removed. Account equity remains unconfigured until a reconciled account source exists.

### Backend API surface

- `GET /health`, `GET /api/providers`, `GET /api/registry`, `GET /api/agents`
- `GET /api/agent-tasks`, `GET /api/decisions`, `GET /api/audit`, `GET /api/portfolio`
- `GET /api/market/tickers`, `GET /api/market/klines`, `GET /api/market/depth`
- `GET /api/market/bitget/tickers` for public Bitget Spot/Margin-reference and futures-category tickers
- `GET /api/solana/new-pools` and `GET /api/solana/pairs?token=...`
- `POST /api/scan`, `POST /api/backtest`, and `GET /api/backtests`
- `GET /api/ai/status`, `POST /api/agents/analyse` (one department per explicit request; requires Workers AI enabled; human-readable report response)\n- `POST /api/institutional/analyse` (run the ten specialist institutional assessments and enqueue persistent role tasks)\n- `GET /api/institutional/latest?symbol=BTCUSDT`, `GET /api/institutional/analyses`\n- `GET /api/runtime/status` (task, evidence, messaging and supervisor workflow counts)
- `GET /api/paper/account`, `GET /api/paper/positions`, `GET /api/paper/fills`
- `POST /api/paper/orders` (requires `mode: "paper"` and `side: "long"`), `POST /api/paper/positions/:id/close`

### Department runtime coverage

The registry API reports handler coverage explicitly. Institutional Intelligence now has ten independently addressable role-task handlers, persisted assignments, evidence records, inter-agent messages and a supervisory arbiter. These handlers operate on the same validated market snapshot, so they are independent task executions but not independent exchange data collectors or separate always-on processes. Other departments remain registered or share existing analytical services; do not interpret the role catalogue as proof that all 172 roles are continuously running.

## Local development

Requirements: Node.js 22+ and npm.

1. Install the exact locked dependencies: `npm ci`.
2. Apply the local D1 schema: `npm run db:local`.
3. Start the Worker in one terminal: `npm run dev:backend`.
4. Start the dashboard in another terminal: `npm run dev`.
5. Verify: `npm run test`, `npm run build`, `npm run typecheck:worker`, and `npm run db:local`.

Vite proxies `/api` to the local Worker at `127.0.0.1:8787`.

## Cloudflare deployment

1. Create a D1 database named `jp-bots-6` with `npx wrangler d1 create jp-bots-6`.
2. Replace the all-zero placeholder `database_id` in `wrangler.toml` with the real database ID.
3. Apply remote migrations: `npm run db:remote`.
4. Deploy the backend Worker: `npm run deploy:backend`.
5. Deploy the Vite dashboard to Cloudflare Pages with build command `npm run build` and output directory `dist`.
6. Configure a Cloudflare Pages Service Binding named `API_WORKER` pointing to the deployed Worker service `jp-bots-6-backend`. The Pages Function under `functions/api/[[path]].ts` proxies dashboard API calls to that binding.

The Worker requires the D1 and Durable Object bindings declared in `wrangler.toml`. Do not deploy the Worker with the placeholder D1 ID.

## Decision and safety boundaries

**Capital protection is the final authority.** The decision path is market intelligence → strategy/signal validation → independent evidence arbitration → capital protection → execution eligibility. Agent consensus cannot override a risk veto.

- The scheduled scanner currently produces observations and risk-gated assessments. It deliberately does not submit orders.
- The scanner's execution-economics and per-trade-risk checks remain closed until a validated strategy entry/stop/target model, calculated position-risk budget and venue-specific fee schedule are configured.
- No primary account is configured or reconciled. The capital authority therefore blocks entries by default.
- Live trading is hard-disabled. No private exchange credentials, Bitget order execution adapter, margin/futures order adapter, Solana DEX swap adapter or withdrawal capability is connected. Bitget public market-data endpoints do not imply trading support.
- Macro/news providers and source-trader discovery providers are not configured. The API reports these as unavailable instead of fabricating results.
- The queue now supports market scans and persistent institutional specialist tasks. It does **not** mean 172 independent always-on AI processes are deployed. The ten institutional handlers are independently addressable task executions on shared market evidence; the other departments still require their own tested handlers, providers, persistence and health monitoring.
- Backtesting currently implements one spot long-only EMA crossover research strategy, not the full multi-strategy, tick-replay, market-impact, funding or multi-exchange test suite. It does not yet model strategy-specific stops, partial fills or risk-based sizing. Backtest success never enables live trading.
- Paper execution now has a separate D1-backed simulated account and position/fill ledger. It sizes spot-long entries from stop distance and the configured paper risk cap, simulates fills against visible Binance Spot order-book depth, rejects stale data, insufficient depth, excessive slippage and poor net reward/risk, and accounts for entry/exit fees. Open paper positions are checked against stop and target levels during scheduled/manual market scans. Paper entries are currently explicit API requests; the scanner does not autonomously create entries. The default USD 10,000 paper balance is simulated and is not connected to an exchange account.
- Workers AI is bound through Wrangler but inference is disabled by default (`AI_ENABLED=false`). Set the Worker secret `OPERATOR_API_TOKEN` with `npx wrangler secret put OPERATOR_API_TOKEN`, then set `AI_ENABLED=true` in Worker variables only after reviewing Cloudflare account usage and model costs. The analysis endpoint requires `Authorization: Bearer <OPERATOR_API_TOKEN>` to prevent unauthorised inference usage. `POST /api/agents/analyse` runs one department council at a time; the model produces advisory role findings, not 162 independent always-on AI processes. Findings are validated and persisted, but they cannot authorize orders. Cloudflare documents that Workers AI inference incurs usage charges, including local development.
- Institutional analytics use public Binance Spot REST candles, depth and aggregate trades. Whale-sized trades are sample-relative outliers and do not identify the beneficial owner. Volume profile is approximated from candle typical-price volume, not true exchange tick-level volume-at-price. Liquidity pools are repeated swing levels, not verified resting orders. Accumulation, execution footprint, market-maker behaviour and positioning are probabilistic public-data proxies. No spoofing or hidden parent-order claim is made.\n- FVG, liquidity and entry zones are candidate levels, not guaranteed fills or order instructions. The supervisor currently records blocked paper workflows because a separately qualified institutional strategy, aligned multi-timeframe confirmation, execution-cost validation and reconciled capital approval are not yet connected. The autonomous paper workflow therefore does not open positions at this stage.\n- Binance and DexScreener integrations are public read-only HTTP data sources. There is no continuous WebSocket order-book stream yet.
- Never treat illustrative configuration defaults, missing account data or unavailable provider data as verified live facts.

The platform must remain selective: no trade is preferable to an unverified trade. No architecture can guarantee profits; measure all strategy performance net of fees, spread, funding, slippage and execution impact.

Never commit API keys, seed phrases, private keys or exchange secrets.
