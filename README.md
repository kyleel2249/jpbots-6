# JP Bots 6

Independent autonomous multi-agent trading intelligence terminal. This repository is separate from ETI/JPTI.

## Current release
- Video-inspired dark trading terminal with animated spider/web scanner.
- 20 specialist agent identities across scalping, day trading, Solana, intelligence, risk and research.
- Central signal risk gate and position-sizing utility.
- Paper/demo mode only. Live execution is intentionally disabled.

## Run locally

```bash
npm install
npm run dev
npm run build
```

Market prices currently shown in the interface are illustrative demo values, not exchange data. No orders are sent to an exchange or wallet.

## Safety
Never commit API keys, seed phrases, private keys or exchange secrets. Live execution requires separate secure credential storage, venue adapters, independent testing, and explicit operator approval.
