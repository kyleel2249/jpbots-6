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

## AMD session strategy

The AMD strategy is an additional session-gated institutional setup, not a replacement for other strategies. Its source image specifies 03:00–06:00 accumulation (strict no-entry), 06:00–09:00 manipulation (strict no-entry), and 09:00–12:00 distribution (only entry window). During distribution it requires CISD or MSS confirmation plus either a sweep of the manipulation high/low or a retest of a strong Premium/Discount array formed during manipulation. The engine exposes session ranges, sweep flags, CISD/MSS state, qualified PD Arrays and candidate entry zones. `AMD_SESSION_TIMEZONE` defaults to `UTC` in `wrangler.toml` because the source image does not specify a timezone; configure it to the intended market-session timezone before enabling paper entries. Outside the distribution window, or without the full confirmation chain, the AMD gate blocks paper entries.

## AMD historical validation and forward observation

The AMD validation suite reconstructs complete local-time sessions from closed Binance Spot 5-minute candles. It does not use the current session phase to relabel historical candles. Entries are evaluated candle-by-candle: a qualified signal can only enter on the next candle, and stop/target collisions resolve stop-first. The replay applies configurable round-trip fees and slippage, fixed fractional equity risk sizing, session-end exits and a maximum holding horizon.

The replay reports win rate, net expectancy in R, profit factor, realised-equity maximum drawdown, average and median R, recovery factor, maximum win/loss streaks, MFE/MAE in price and R units, trade duration, long/short counts, and bullish/bearish/ranging session breakdown. A deterministic 1,000-resample bootstrap reports 95% expectancy and win-rate intervals when at least five trades exist; smaller samples are explicitly marked inadequate. Execution-cost stress results compare the configured slippage with +5 and +10 bps. Profit factor is null when there are wins but no losing trades (mathematically unbounded), rather than serialising Infinity.

Parameter optimisation compares timezone, sweep sensitivity (basis points), and minimum PD Array strength. Candidate selection uses chronological complete-local-session splits; the holdout segment is not used to rank candidates. Robustness requires minimum trade samples, positive train and holdout expectancy, and bounded holdout drawdown. A high in-sample score alone is not a promotion criterion.

Walk-forward validation uses expanding training windows and subsequent unseen session blocks, then reserves a final untouched 20% chronological segment. It reports each fold, the aggregate out-of-sample results, and final untouched holdout separately. Regime breakdowns are descriptive; they are not used to make future-informed entry decisions.

The forward observer runs every five minutes for BTCUSDT, ETHUSDT and SOLUSDT. It writes one deduplicated record per closed 5-minute candle, including forbidden-phase rejections, unqualified distribution attempts, strategy conflicts, and qualified-but-unexecuted missed entries. It is observation-only by default. If both `AUTO_PAPER_ENABLED=true` and `AMD_PAPER_FORWARD_ENABLED=true` are explicitly configured, a fully arbitrated bullish Spot-long opportunity may open one simulated paper position per symbol/session, subject to current-price proximity, stop/target geometry and an atomic session lock. Bearish signals remain recorded because the current paper engine does not support shorts. Every record stores the assessment, reasons, arbitration outcome and paper-order-attempt flag. The AMD forward switch remains false by default.

AMD validation POST endpoints require `Authorization: Bearer $OPERATOR_API_TOKEN`:
- `POST /api/amd/replay` — body: `{"symbol":"BTCUSDT","days":30,"timezone":"Africa/Accra"}`
- `POST /api/amd/optimise` — compare candidate timezones, `sweepSensitivitiesBps` and `arrayStrengths`
- `POST /api/amd/walk-forward` — body: `{"symbol":"BTCUSDT","days":30,"folds":3}`
- `POST /api/amd/forward/run` — run one forward observation immediately

Read-only endpoints:
- `GET /api/amd/forward?symbol=BTCUSDT&limit=100` — forward opportunity ledger
- `GET /api/amd/validation/runs?symbol=BTCUSDT` — persisted replay, optimisation and walk-forward runs

Historical requests are capped at 60 days and use paginated closed 5-minute candles. This is public market-data replay, not tick/order-book replay; funding, futures margin, liquidation and exchange queue-position effects are not modelled. Optimisation is research-only and must not automatically replace the configured session parameters. The forward observer records all opportunities independently; the optional paper-order extension is separately gated by both safety switches and remains disabled by default.


## Secure website-to-Worker integration

The website must call backend APIs through the same-origin Cloudflare Pages Function at `/api/*`. The browser must never receive `OPERATOR_API_TOKEN`, and must not send a Bearer token from client-side code.

Configure the Cloudflare Pages project (both Production and Preview environments if both are used):

1. **Settings → Functions → Service bindings:** add binding name `API_WORKER`, selecting the deployed Worker service `jp-bots-6-backend`. The Worker must be deployed in the same Cloudflare account and the selected environment must point at the intended Worker environment.
2. **Settings → Variables and Secrets:** add a secret named `OPERATOR_API_TOKEN` with exactly the same value as the `OPERATOR_API_TOKEN` secret configured on the backend Worker. Worker secrets are not automatically shared with Pages Functions; configuring the Pages secret is a separate required step.
3. Redeploy the Pages application after changing bindings or secrets so the deployment receives the new environment configuration.
4. Keep the Worker secret configured independently. Never use a `VITE_*` variable, frontend `.env` value, HTML meta tag, local storage or browser request header as a place to store the operator token.

The Pages proxy strips any browser-supplied Authorization header and injects the Pages secret server-side only for protected operator routes (AMD APIs, institutional strategy execution, AI analysis and operator diagnostics). Public market-data/registry requests do not require the operator token. Missing binding, missing Pages secret and unavailable Worker responses return distinct machine-readable errors.

The dashboard's **AMD VALIDATION** tab exposes historical replay, parameter optimisation, walk-forward validation, forward observation and the opportunity ledger. Its backend connection panel authenticates through `GET /api/operator/status` and actively probes D1, KV (temporary expiring key) and the Durable Object orchestrator. This diagnostic route requires valid Pages-to-Worker secret forwarding; it does not expose the secret.

After configuration, verify:
- `GET /api/health` reports backend/D1 health (unauthenticated liveness check).
- `GET /api/operator/status` reports `authenticated: true` and all three infrastructure checks as `connected`.
- The browser Network panel shows same-origin `/api/*` requests only; no token value is present in browser JavaScript, request headers or build artifacts.
- An unauthenticated direct request to a protected Worker route receives HTTP 401.

## Implemented backend foundation

- **Cloudflare Worker API** in `backend/worker.ts`, deployed separately from the Vite/Pages dashboard.
- **Cloudflare D1** migrations for market snapshots, order-book snapshots, scan decisions, agent tasks/state, portfolio account state, trade memory, strategy versions, audit events, backtest runs and paper-execution event records.
- **Durable Object orchestration queue** with persistent queued tasks and alarm-driven processing.
- **Scheduled market scanning** every minute for BTCUSDT, ETHUSDT and SOLUSDT. The Durable Object alarm scheduler runs the market scanner and institutional analysis pipeline independently of the browser tab, then fans institutional findings out to ten institutional role tasks per symbol. The scheduler is bootstrapped by the first Worker HTTP request and then re-arms its own alarm every minute; it does not consume an account-level Cron Trigger.
- **Real Binance Spot public REST data** for 24-hour tickers, OHLCV candles, order-book depth and aggregate trades. The scanner calculates 1m EMA/RSI and 5m/15m/1h/4h EMA alignment, builds a structured market report and evaluates order-book evidence.
- **Real DexScreener token-pair lookup** for a supplied Solana token mint. This is read-only lookup, not a complete new-pair stream or DEX execution adapter.
- **Historical research backtesting** using Binance candles and a legacy EMA crossover baseline. The institutional engine separately provides 5m/15m/1h/4h trend alignment, FVG retracement entries, swing/ATR stops, cost-adjusted targets, conservative historical replay, rolling walk-forward folds and a final untouched 20% out-of-sample segment. The replay includes fee, slippage, spread and impact assumptions and resolves same-candle stop/target collisions conservatively by assuming the stop is hit first.
- **Shared intelligence and risk primitives** for order-book imbalance, weighted imbalance, cumulative depth, microprice, trade imbalance, market reports, evidence arbitration, capital veto, trader qualification, portfolio stress and deployment qualification.
- **Persistent paper execution ledger** with a clearly separate simulated account, risk-based spot-long sizing, ask/bid depth consumption, partial-fill rejection, fee/slippage accounting, stop/target validation, position close accounting and audit events. The starter paper balance is simulated USD 5.00, not real funds. Migration `0007_predictive_liquidity.sql` changes only an untouched default starter account from USD 10,000 to USD 5.00; it never resets an account with any position or fill history. The configured `AUTO_PAPER_ENABLED=true` schedules institutional strategy paper workflows after migration and deployment. The simulator remains Spot-long only, uses risk/capital vetoes, and is not connected to private exchange credentials.
- **Optional Workers AI specialist councils** that run a department's registered specialist roles against a supplied live market snapshot, validate exact role names and structured findings, mark missing evidence as incomplete, and persist every result. User-facing reports are plain-language summaries; structured formats remain internal for validation. AI inference is disabled by default and is never an execution authority.
- **Institutional Intelligence Department** with ten existing market-evidence specialists plus two AMD specialists: Session Phase Intelligence and CISD & Market Structure Shift Intelligence. It covers order flow, liquidity pools, whale-sized public trades, order-book imbalance, estimated volume profile and auction state, accumulation/distribution proxies, liquidity sweeps, execution footprints, market-maker stress proxies, positioning/sentiment proxies, session phase classification, structural confirmation and manipulation-phase PD Arrays. The engine maps FVGs, candidate liquidity zones and nearby entry zones; every output carries evidence confidence, provenance and explicit limitations.
- **Persistent specialist task workflow** assigns ten institutional role tasks to the Durable Object queue, records evidence and inter-agent messages in D1, updates role state, retries failed tasks, and invokes a supervisory evidence arbiter after the specialist evidence set completes. The supervisor writes an analysis-only paper strategy workflow record; it does not bypass strategy, multi-timeframe, execution-economics or capital approval gates.
- **Dashboard market prices** now come from the backend API. Synthetic random price movement, fabricated ticker changes, synthetic paper P&L and fake agent activity were removed. Account equity remains unconfigured until a reconciled account source exists.

### Backend API surface

- `GET /health`, `GET /api/providers`, `GET /api/registry`, `GET /api/agents`
- `GET /api/agent-tasks`, `GET /api/decisions`, `GET /api/audit`, `GET /api/portfolio`
- `GET /api/market/tickers`, `GET /api/market/klines`, `GET /api/market/depth`
- `GET /api/market/bitget/tickers` for public Bitget Spot/Margin-reference and futures-category tickers
- `GET /api/solana/new-pools` and `GET /api/solana/pairs?token=...`
- `POST /api/scan`, `POST /api/backtest`, and `GET /api/backtests`
- `GET /api/ai/status`, `POST /api/agents/analyse` (one department per explicit request; requires Workers AI enabled; human-readable report response)
- `POST /api/institutional/analyse` (run the ten specialist institutional assessments and enqueue persistent role tasks)
- `GET /api/institutional/latest?symbol=BTCUSDT`, `GET /api/institutional/analyses`
- `POST /api/institutional/strategy/run` (4-timeframe plan, AMD session assessment, historical replay, rolling walk-forward, untouched OOS, cost model and opt-in automatic paper entry)
- Scheduled institutional paper strategy scans run every five minutes when the Worker variable `AUTO_PAPER_ENABLED=true`; the repository configuration now enables this paper-only workflow after the $5 account migration is applied. AMD forward paper entries remain separately disabled by `AMD_PAPER_FORWARD_ENABLED=false`.
- `GET /api/institutional/strategy/latest?symbol=BTCUSDT`
- `GET /api/runtime/status` (task, evidence, messaging and supervisor workflow counts)
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

The Worker must not be deployed until remote migrations have completed and the required KV namespace binding has been configured. The scheduler uses a Durable Object alarm rather than a Cron Trigger, so it works within Cloudflare Free's five-account-cron limit. The first HTTP request to the Worker bootstraps the alarm; subsequent scheduling is autonomous. Live exchange execution remains disabled.
 
## Decision and safety boundaries

**Capital protection is the final authority.** The decision path is market intelligence → strategy/signal validation → independent evidence arbitration → capital protection → execution eligibility. Agent consensus cannot override a risk veto.

- The scheduled market scanner produces observations and risk-gated assessments. The separate institutional strategy workflow can create paper entries every five minutes when `AUTO_PAPER_ENABLED=true`; the current Wrangler configuration enables this paper-only workflow after the $5 migration. The paper engine remains Spot-long only.
- Institutional strategy proposals now calculate multi-timeframe FVG entries, swing/ATR invalidation stops, cost-adjusted targets and risk-sized quantities. A proposal is not an order; automatic paper entries require explicit `autoPaper: true`, a valid long setup, near-market price geometry, fresh executable depth and paper-account capital approval.
- No primary account is configured or reconciled. The capital authority therefore blocks entries by default.
- Live trading is hard-disabled. No private exchange credentials, Bitget order execution adapter, margin/futures order adapter, Solana DEX swap adapter or withdrawal capability is connected. Bitget public market-data endpoints do not imply trading support.
- Macro/news providers and source-trader discovery providers are not configured. The API reports these as unavailable instead of fabricating results.
- The queue now supports market scans and persistent institutional specialist tasks. It does **not** mean 174 independent always-on AI processes are deployed. The ten institutional handlers are independently addressable task executions on shared market evidence; the other departments still require their own tested handlers, providers, persistence and health monitoring.
- The institutional strategy replay is research-only and still requires broader market regimes, more symbols, longer histories, realistic venue-specific queue/partial-fill data, and paper forward testing. It does not model futures funding, leverage, margin, liquidation or private-exchange execution. It does not yet model strategy-specific stops, partial fills or risk-based sizing. Backtest success never enables live trading.
- Paper execution now has a separate D1-backed simulated account and position/fill ledger. It sizes spot-long entries from stop distance and the configured paper risk cap, simulates fills against visible Binance Spot order-book depth, rejects stale data, insufficient depth, excessive slippage and poor net reward/risk, and accounts for entry/exit fees. Open paper positions are checked against stop and target levels during scheduled/manual market scans. Paper entries can be requested through the institutional strategy API or scheduled automatically when `AUTO_PAPER_ENABLED=true`. The scheduled strategy worker is enabled in the current Wrangler configuration; no paper entry is created unless the plan, price geometry, fresh order book and capital checks pass. The starter USD 5.00 paper balance is simulated and is not connected to an exchange account.
- Workers AI is bound through Wrangler but inference is disabled by default (`AI_ENABLED=false`). Set the Worker secret `OPERATOR_API_TOKEN` with `npx wrangler secret put OPERATOR_API_TOKEN`, then set `AI_ENABLED=true` in Worker variables only after reviewing Cloudflare account usage and model costs. The analysis endpoint requires `Authorization: Bearer <OPERATOR_API_TOKEN>` to prevent unauthorised inference usage. `POST /api/agents/analyse` runs one department council at a time; the model produces advisory role findings, not 162 independent always-on AI processes. Findings are validated and persisted, but they cannot authorize orders. Cloudflare documents that Workers AI inference incurs usage charges, including local development.
- Institutional analytics use public Binance Spot REST candles, depth and aggregate trades. Whale-sized trades are sample-relative outliers and do not identify the beneficial owner. Volume profile is approximated from candle typical-price volume, not true exchange tick-level volume-at-price. Liquidity pools are repeated swing levels, not verified resting orders. Accumulation, execution footprint, market-maker behaviour and positioning are probabilistic public-data proxies. No spoofing or hidden parent-order claim is made.
- FVG, liquidity and entry zones are candidate levels, not guaranteed fills or order instructions. The supervisor currently records blocked paper workflows because a separately qualified institutional strategy, aligned multi-timeframe confirmation, execution-cost validation and reconciled capital approval are not yet connected. The autonomous paper workflow therefore does not open positions at this stage.
- Binance and DexScreener integrations are public read-only HTTP data sources. There is no continuous WebSocket order-book stream yet.
- Never treat illustrative configuration defaults, missing account data or unavailable provider data as verified live facts.

The platform must remain selective: no trade is preferable to an unverified trade. No architecture can guarantee profits; measure all strategy performance net of fees, spread, funding, slippage and execution impact.

Never commit API keys, seed phrases, private keys or exchange secrets.

## Advanced Intelligence 2.0

The **ADVANCED INTELLIGENCE** dashboard tab runs an authenticated, on-demand research assessment over the current Binance Spot 1-minute close/volume sample, public aggregate trades and top-20 displayed order-book depth. It reports a descriptive volatility/trend regime, spread and depth metrics, buy/sell aggressor notional, independent bullish/bearish/neutral evidence arguments, adversarial vetoes and a conservative research-only risk gate.

The endpoint is `POST /api/intelligence/advanced` with `{"symbol":"BTCUSDT"}`. It is protected by `OPERATOR_API_TOKEN`; the Pages proxy strips browser Authorization headers and injects its server-side secret. Supported symbols are BTCUSDT, ETHUSDT, SOLUSDT and BNBUSDT. Every assessment is written to the audit ledger. The engine does not submit orders, does not claim to identify institutions from public trades, and always returns `liveTradingEnabled: false`.

Confidence calibration is deliberately unavailable until at least 20 labelled outcomes are supplied to the calibration function; it is not fabricated from the current market snapshot. The research gate is not a strategy qualification or paper-order authorisation. Historical validation, multi-timeframe confirmation, execution-cost checks and the independent capital veto remain mandatory. Inputs are rejected when candles, volume alignment, order-book levels or trade records are malformed; stale/future order-book data, excessive spread and extreme realised volatility trigger adversarial vetoes.

### Derivatives intelligence extension

The Advanced Intelligence assessment also attempts to retrieve public Binance USD-Margined Futures premium-index and open-interest observations. It reports funding rate, next funding time, mark-versus-spot basis and the latest open-interest contract count. If either provider request fails or returns malformed data, the derivatives section is explicitly marked unavailable and the Spot assessment continues; no missing derivative field is fabricated. Funding extremes and mark/spot divergence are warnings, not directional trade instructions. A single open-interest observation cannot establish whether positions are building or closing. The public derivatives feed is supplemental, may be unavailable by region/provider, and is not used to enable orders.

## Predictive Liquidity & Cross-Exchange Intelligence

The **PREDICTIVE LIQUIDITY** dashboard tab and authenticated `POST /api/intelligence/predictive` endpoint provide a research-only assessment:

- **Cross-exchange synchronisation:** compares fresh Binance Spot and Bitget Spot order-book snapshots, checks timestamps and cross-venue mid-price skew, rejects stale/future/crossed books, and requires at least two fresh exchanges before reporting a healthy synchronisation state.
- **Liquidity mapping:** buckets displayed bid/ask depth by price distance from the reference price and ranks net bid/ask notional zones. These are transient displayed orders, not guaranteed support/resistance.
- **Historical derivatives:** retrieves public Binance USD-M funding-rate history and 5-minute open-interest history, aligns observations by timestamp, persists the observations in D1, and calculates the sampled open-interest change. Provider failures produce an explicit unavailable state.
- **Liquidation intelligence:** stores externally ingested, provenance-labelled liquidation observations and calculates long/short liquidation notional over the latest 24 hours. An authenticated ingestion endpoint is available at `POST /api/intelligence/liquidations/ingest` with `{ "symbol":"BTCUSDT", "exchange":"...", "source":"...", "events":[{"id":"...","observedAt":0,"side":"long","price":0,"quantity":0}] }`. The ingestion route does not itself verify the upstream exchange source. No verified historical liquidation provider is configured by default; an empty table is reported as unavailable, never as zero liquidations.
- **Independent specialist debate:** six deterministic specialist evaluators separately score trend, order flow, displayed liquidity, funding, open-interest change and liquidation evidence. Each report carries provenance and an availability flag. Missing evidence is not counted as neutral proof.
- **Adversarial strategy testing:** stresses spread expansion, slippage, missed fills and latency; failure blocks promotion.
- **Strategy discovery:** a bounded, deterministic evolutionary search ranks candidate moving-average genomes against observed historical closes with fee/slippage costs and drawdown penalties. This is discovery only; a chronological holdout and independent validation are required before promotion.
- **Portfolio correlation and CVaR:** calculates an equal-weight historical return approximation from BTC, ETH and SOL 1-minute samples when available, with pairwise correlations and 95% historical VaR/CVaR. It is not a portfolio-weight-aware capital approval.
- **Smart execution simulation:** consumes displayed depth, estimates average fill, fees, latency/queue penalties and slippage, and rejects incomplete or over-cost fills.
- **Deterministic decision replay:** stores ordered decision events with predecessor-linked deterministic checksums and exposes authenticated `GET /api/intelligence/replay?runId=...`. Checksums detect accidental mutation; they are not cryptographic signatures.
- **Agent recovery:** Durable Object task retries now persist attempt counts, idempotency keys, retry leases and quarantine states in D1. Authenticated `GET /api/intelligence/recovery` reports recovery actions and exhausted retry budgets.

All predictive endpoints are protected by the Pages server-side `OPERATOR_API_TOKEN` proxy. The engine never creates exchange orders or enables live trading. The paper simulator remains a separate execution boundary. The $5.00 balance is simulated capital only; it is not a deposit or a live exchange balance.

### Data and production limitations

Binance public REST provides historical funding and open-interest endpoints, but it does not expose a complete historical liquidation tape through the public REST routes used here. Liquidation events therefore require a separately operated, authenticated collector using a reliable venue stream or licensed provider; the ingestion endpoint labels supplied data as operator-ingested and does not certify it. Cross-exchange comparison currently uses Binance and Bitget Spot order books, not a global consolidated book. The current portfolio calculation is equal-weight and short-horizon. Strategy evolution is research-only, and no candidate is auto-promoted. Deterministic replay checksums are not a substitute for signed audit records. No live exchange order adapter or private credentials are configured.

### Activation sequence for the $5 paper account

1. Apply the new schema and starter-account migration: `npm run db:remote`. This migration only resets the untouched starter account; it deliberately preserves any account with trading history.
2. Deploy the backend Worker with `npm run deploy:backend`.
3. Redeploy the Pages frontend after confirming `API_WORKER` points to `jp-bots-6-backend` and the Pages `OPERATOR_API_TOKEN` matches the Worker secret.
4. Verify `GET /api/paper/account` reports `mode: "paper"`, `initialEquity: 5`, and that `GET /api/operator/status` is healthy.
5. Run the Predictive Liquidity assessment and verify both exchanges synchronise before interpreting a consensus.

Do not apply remote migrations or deploy automatically from CI. The repository CI validates the migration locally and performs a Wrangler dry-run; remote database changes and production deployment remain explicit operator actions.


## Backend recovery, paper equity and LLM provider configuration

### Why the dashboard can report backend offline

The Pages frontend and `jp-bots-6-backend` are separate deployments. A Pages build does not deploy the Worker. Confirm the Worker named in `wrangler.toml` is deployed in the same Cloudflare account and that the Pages Service Binding is named `API_WORKER` and targets `jp-bots-6-backend`. The Pages secret `OPERATOR_API_TOKEN` must match the Worker secret. The Worker also requires its D1, KV and Durable Object bindings. Check `/api/health` and authenticated `/api/operator/status` after deployment.

### Restore the $5 paper account

The dashboard now reads `GET /api/paper/account` and displays the persisted paper equity rather than a hard-coded live-account placeholder. If the response says `configured:false`, apply the pending D1 migrations to the correct remote database with `npm run db:remote`, then deploy the Worker. Migration 0007 initialises only an untouched starter account; it does not overwrite trading history. A displayed $5.00 balance is simulated USD, not an exchange wallet.

### LLM activation and multiple API keys

`AI_ENABLED=true` enables authenticated specialist analysis. The provider adapter accepts up to five OpenAI-compatible provider key slots in the Worker secret `LLM_API_KEYS`, as a JSON array, for example:

```json
[
  {"baseUrl":"https://api.openai.com/v1","apiKey":"YOUR_KEY_1","model":"YOUR_SUPPORTED_MODEL"},
  {"baseUrl":"https://api.openai.com/v1","apiKey":"YOUR_KEY_2","model":"YOUR_SUPPORTED_MODEL"}
]
```

Use actual provider-issued keys and models that your account is entitled to use. The adapter tries configured key slots in order and then falls back to the bound Cloudflare Workers AI model. Store this JSON only as a Cloudflare Worker secret named `LLM_API_KEYS`; never commit it, place it in `VITE_*`, or send it through the browser. Also configure `OPERATOR_API_TOKEN` as a Worker secret and matching Pages secret. Workers AI uses its binding and does not require an API key. The repository cannot create or provision third-party API keys on the user's behalf.

The analysis endpoint remains authenticated and analysis-only. LLM output is validated against registered specialist roles; missing or malformed findings remain incomplete. LLM output cannot authorise live exchange orders.

### Deploy the backend Worker

A manual GitHub Actions workflow `.github/workflows/deploy-backend.yml` is provided. Add a GitHub Actions repository secret `CLOUDFLARE_API_TOKEN` with permission to deploy Workers in this account, then run the workflow from the Actions tab. Apply remote D1 migrations deliberately before deploying code that requires the new schema. This deployment workflow does not silently mutate the remote database.


## Global multi-asset market intelligence

The global scanner is a **market-data discovery and research system**, not a backend self-scanner. It discovers exchange instruments, public DEX pools and chain metrics, persists a provenance-tagged universe, and ranks observation-only opportunities.

### Current provider coverage

- Binance Spot: exchange-wide active USDT, USDC and FDUSD spot catalog plus 24-hour tickers.
- Binance USD-M: active USDT/USDC perpetual contract catalog and 24-hour tickers.
- Bitget Spot and Bitget USDT perpetual: public exchange-wide ticker feeds.
- Bybit Spot and Linear USDT perpetual: public exchange-wide ticker feeds.
- OKX Spot and USDT perpetual swaps: public exchange-wide ticker feeds.
- GeckoTerminal: new-pool discovery on Solana, Ethereum, Base, BNB Chain, Arbitrum, Optimism, Polygon and Avalanche.
- DexScreener: latest token-profile discovery.
- DeFiLlama: chain-level TVL observations.
- Frankfurter: daily FX reference rates only (not live executable forex quotes).
- Twelve Data (optional): rotating equity, index, commodity and intraday FX quote sample.

The scanner performs quote/volume screening across the discovered universe and detailed 5-minute OHLCV analysis on a bounded, liquidity-ranked Binance Spot/perpetual sample. Chart analytics include EMA trend, RSI, ATR percentage, relative volume, engulfing/rejection patterns, fair-value gaps, and rolling support/resistance. Opportunity scores are evidence summaries, not calibrated probabilities or trade instructions.

### Optional equities / indices / intraday FX / commodities provider

To enable Twelve Data coverage, create an API key with the provider and store it only as a Cloudflare Worker secret:

```sh
npx wrangler secret put TWELVEDATA_API_KEY
```

Do not put provider keys in frontend variables, source files, Pages static assets, or browser storage. The current adapter rotates through a small six-symbol quote set to limit free-tier request usage. The provider's plan and rate limits determine actual coverage.

### Scanner endpoints

- `GET /api/global-market/status`: latest run, source health and asset-class counts.
- `GET /api/global-market/universe?limit=100`: discovered instruments.
- `GET /api/global-market/universe?assetClass=crypto-perpetual`: filter the universe.
- `GET /api/global-market/opportunities?limit=50`: ranked recent observations.
- `POST /api/global-market/scan`: operator-authenticated discovery and scan. A scheduled Durable Object task also refreshes discovery every 15 minutes.

### Coverage and safety limitations

No single public provider exposes every exchange, every tradable pair, every forex venue, every equity, every commodity, or every on-chain pool. Public API catalogues are incomplete, rate-limited and may be delayed. This implementation therefore reports source-level health and clearly separates exchange-listed instruments, DEX discovery, chain TVL and daily FX reference rates. It does not claim exhaustive global-market coverage. More exchange adapters, licensed institutional feeds, exchange-specific contract metadata, RPC/indexer providers, and intraday FX/equities subscriptions are required to approach comprehensive coverage.

All outputs are research-only. No global scanner result can authorise an order; live exchange execution remains disabled.
