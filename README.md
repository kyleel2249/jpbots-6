# JP Bots 6

JP Bots 6 is an independent multi-agent trading intelligence platform. It is not an extension, fork, rename or modification of ETI/JPTI.

## Integrated architecture foundation

- 17 specialist departments, including market intelligence, scalping, day trading, multi-exchange trader replication, capital protection, signal intelligence, strategy evolution, Advanced Trading Intelligence 2.0, backtesting/paper/live validation, execution, position management, Solana token intelligence, order-book intelligence, portfolio allocation, learning/memory, orchestration and reliability.
- Specialist role registry generated from the department definitions. Registry entries are definitions, not evidence that worker processes are deployed or running.
- Strategy catalog includes scalping, intraday and additional trend, swing, momentum, mean-reversion, breakout, pullback, reversal, range, arbitrage, funding, basis, volatility, grid, DCA, hedging, market-making, liquidation-event, news-reaction and adaptive-hybrid bot identities.
- Shared market intelligence and signal/risk/deployment qualification primitives.
- Order-book analytics: OBI, weighted imbalance, cumulative depth bands, microprice, trade imbalance, queue-change proxy, depth sweep simulation, fees and slippage estimates.
- Central capital authority, correlation/exposure limits, kill-switch conditions, evidence arbitration, scalping guards and reconciliation-before-resume rules.
- Shared testing graduation gates, trade-memory validation, performance learning and auditable strategy version requirements.
- Bitget market-category capability model for Spot, Margin, USDT-M, Coin-M and USDC-M. Venue adapters are not connected.

## Run locally

```bash
npm install
npm run test
npm run build
npm run dev
```

## Deployment and safety boundaries

This repository currently provides architecture, registry, deterministic analytical functions and a demo dashboard. It is not yet a production autonomous trading system.

- Dashboard market values remain illustrative demo data. No live market-data provider, DEX feed, trader-discovery API, macro/news provider, persistent D1 database, Durable Object orchestration, WebSocket service or exchange order adapter is connected.
- Bitget market categories are represented in the capability model only. No exchange credentials or orders are used.
- Agent roles are registered but are not independent, continuously running workers. The browser demo's animated scanner and demo signal flow must not be interpreted as live market scanning or real agent activity.
- Live execution remains disabled. Do not enable it until secure secret storage, exchange adapters, account/order/position reconciliation, staged testing, restricted-live evidence and explicit operator approval are implemented.
- Deployment qualification requires unit/regression tests, historical backtesting, out-of-sample validation, walk-forward and stress tests, paper trading and controlled live testing. Backtests alone never grant production permission.
- Risk authority must remain independent and final. No agent vote, strategy or bot may override a risk veto. Resume only after market data, exchange health and account state are reconciled and an operator approves.
- No strategy guarantees profit. Evaluate net results after fees, funding, spread, slippage and execution impact.

Never commit API keys, seed phrases, private keys or exchange secrets.
