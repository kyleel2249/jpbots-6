import { describe, expect, it } from 'vitest';
import { planPaperLongEntry, planPaperLongExit } from './paper-trading';
import type { OrderBookSnapshot } from './shared-services';

const book: OrderBookSnapshot = {
  symbol: 'BTCUSDT', timestamp: 1_000, mid: 100,
  bids: [{ price: 99.99, quantity: 20 }, { price: 99.9, quantity: 20 }],
  asks: [{ price: 100.01, quantity: 20 }, { price: 100.1, quantity: 20 }],
  trades: []
};

describe('paper execution planning', () => {
  it('sizes a long position from cash risk and simulates depth-based entry fills', () => {
    const result = planPaperLongEntry({ book, equity: 10_000, stopPrice: 99, targetPrice: 103, riskPct: 0.2, feeBps: 5, now: 1_000 });
    expect(result.valid).toBe(true);
    expect(result.quantity).toBeGreaterThan(0);
    expect(result.averageFillPrice).toBeGreaterThan(100);
    expect(result.actualRiskPct).toBeLessThanOrEqual(0.21);
    expect(result.netRewardRisk).toBeGreaterThan(1.2);
  });
  it('rejects stale data, invalid stops and excessive risk', () => {
    expect(planPaperLongEntry({ book, equity: 10_000, stopPrice: 99, targetPrice: 103, riskPct: 0.2, feeBps: 5, now: 100_000 }).valid).toBe(false);
    expect(planPaperLongEntry({ book, equity: 10_000, stopPrice: 101, targetPrice: 103, riskPct: 0.2, feeBps: 5, now: 1_000 }).valid).toBe(false);
    expect(planPaperLongEntry({ book, equity: 10_000, stopPrice: 99, targetPrice: 103, riskPct: 1, feeBps: 5, now: 1_000 }).valid).toBe(false);
  });
  it('rejects orders that cannot be fully filled from visible depth', () => {
    const thin = { ...book, asks: [{ price: 100.01, quantity: 0.00001 }] };
    const result = planPaperLongEntry({ book: thin, equity: 10_000, stopPrice: 99, targetPrice: 103, riskPct: 0.2, feeBps: 5, now: 1_000 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('insufficient ask-side liquidity for a complete paper fill');
  });
  it('settles exits using bid-side depth and deducts both entry and exit fees', () => {
    const result = planPaperLongExit({ book, quantity: 1, entryPrice: 99, entryFee: 0.05, feeBps: 5, now: 1_000 });
    expect(result.valid).toBe(true);
    expect(result.averageExitPrice).toBeLessThan(100);
    expect(result.netPnl).toBeLessThan(result.grossPnl);
  });
});
