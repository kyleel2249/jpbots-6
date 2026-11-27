# JP Bots 6

Independent multi-agent trading intelligence platform; separate from ETI/JPTI.

## Organisation
Twelve departments and their full specialist roles are registered in `src/departments.ts`: Market Intelligence (16), Scalping (12 agents + 10 bots), Day Trading (12 + 10 bots), Elite Trader Replication (21), Capital Protection (13), Signal Intelligence (15), Strategy Evolution (10), Advanced Trading Intelligence 2.0 (20 engines), Validation (11), Execution (15), Position Management (12), and Solana Token Intelligence (5).

Market reports, portfolio risk gates, Monte Carlo sampling, stress estimates, trader qualification, replication sizing, strategy selection, fee-aware reward/risk, deployment gates and order validation are in `src/intelligence.ts`. The dashboard department tabs expose the registry.

## Run
```bash
npm install
npm run dev
npm test
npm run build
```

## Important operational boundary
This is an architecture and simulation foundation, not a live trading system. Dashboard market values remain illustrative demo data. No exchange/DEX market adapters, trader discovery APIs, news/macro providers, persistent database or real order execution are connected. Intelligence functions operate only on data explicitly supplied to them. Order validation fails closed when live execution is disabled. Never commit API keys, seed phrases or private keys.

Deployment qualification requires tests, historical backtesting, out-of-sample, walk-forward, stress and paper evidence. Restricted live testing still requires explicit operator approval and separate secure credential configuration. Backtests never grant unlimited production permission. Profit is not guaranteed.
