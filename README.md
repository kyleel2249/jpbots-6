# JP Bots 6

JP Bots 6 is an independent multi-agent trading platform. It is not an extension, fork, rename or modification of ETI/JPTI.

## Registered organisation

The primary organisation is deliberately kept at **12 departments and exactly 162 specialist role definitions**:

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

Five cross-cutting capabilities are implemented as shared platform services rather than extra departments or role-count inflation: Order Book & Market Depth Intelligence; Portfolio Allocation Intelligence; AI Learning, Memory & Performance; Agent Collaboration & Orchestration; and Failure Prevention & Incident Response.

The catalogue includes 10 scalping bots, 10 day-trading bots and 19 advanced strategy bot definitions (39 total). Registered agents and bot definitions are not the same as running autonomous workers.

## Implemented backend foundation

- **Cloudflare Worker API** in `backend/worker.ts`, deployed separately from the Vite/Pages dashboard.
- **Cloudflare D1** migrations for market snapshots, order-book snapshots, scan decisions, agent tasks/state, portfolio account state, trade memory, strategy versions, audit events, backtest runs and paper-execution event records.
- **Durable Object orchestration queue** with persistent queued tasks and alarm-driven processing.
- **Scheduled market scanning** every minute for BTCUSDT, ETHUSDT and SOLUSDT. The queue runs a real public-feed scanner independently of the browser tab.
- **Real Binance Spot public REST data** for 24-hour tickers, OHLCV candles, order-book depth and aggregate trades. The scanner calculates 1m EMA/RSI and 5m/15m/1h/4h EMA alignment, builds a structured market report and evaluates order-book evidence.
- **Real DexScreener token-pair lookup** for a supplied Solana token mint. This is read-only lookup, not a complete new-pair stream or DEX execution adapter.
- **Historical backtesting API** using Binance candles and an EMA crossover research strategy. Fills are modelled at the next candle open; configurable fee and slippage assumptions are applied on entry and exit; results include net P&L, win rate, profit factor, expectancy, drawdown and a 70/30 in-sample/out-of-sample split.
- **Shared intelligence and risk primitives** for order-book imbalance, weighted imbalance, cumulative depth, microprice, trade imbalance, market reports, evidence arbitration, capital veto, trader qualification, portfolio stress and deployment qualification.
- **Dashboard market prices** now come from the backend API. Synthetic random price movement, fabricated ticker changes, synthetic paper P&L and fake agent activity were removed. Account equity remains unconfigured until a reconciled account source exists.

## Local development

Requirements: Node.js 22+ and npm.

1. Install dependencies: `npm install`.
2. Apply the local D1 schema: `npm run db:local`.
3. Start the Worker in one terminal: `npm run dev:backend`.
4. Start the dashboard in another terminal: `npm run dev`.
5. Verify: `npm run test`, `npm run build`, and `npm run typecheck:worker`.

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
- The scanner's execution-economics check remains closed until a validated strategy entry/stop/target model and venue-specific fee schedule are configured.
- No primary account is configured or reconciled. The capital authority therefore blocks entries by default.
- Live trading is hard-disabled. No private exchange credentials, Bitget execution adapter, margin/futures order adapter, Solana DEX swap adapter or withdrawal capability is connected.
- Macro/news providers and source-trader discovery providers are not configured. The API reports these as unavailable instead of fabricating results.
- The current scheduled queue executes market-scan tasks; it does **not** mean 162 independent AI processes are deployed. The other departments remain registered and require their own tested task handlers, provider integrations, persistence and health monitoring.
- Backtesting currently implements one EMA crossover research strategy, not the full multi-strategy, tick-replay, market-impact or multi-exchange test suite. Backtest success never enables live trading.
- Paper-order execution and exchange account/position reconciliation are not yet connected. The D1 schema reserves the records, but schema presence is not proof of an operational paper or live execution service.
- Binance and DexScreener integrations are public read-only HTTP data sources. There is no continuous WebSocket order-book stream yet.
- Never treat illustrative configuration defaults, missing account data or unavailable provider data as verified live facts.

The platform must remain selective: no trade is preferable to an unverified trade. No architecture can guarantee profits; measure all strategy performance net of fees, spread, funding, slippage and execution impact.

Never commit API keys, seed phrases, private keys or exchange secrets.
