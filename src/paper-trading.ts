import { simulateBookSweep, type OrderBookSnapshot } from './shared-services';

export type PaperEntryPlanInput = {
  book: OrderBookSnapshot; equity: number; stopPrice: number; targetPrice: number;
  riskPct: number; feeBps: number; maxRiskPct?: number; maxSlippageBps?: number;
  now?: number; maxAgeMs?: number;
};
export type PaperEntryPlan = {
  valid: boolean; errors: string[]; quantity: number; referencePrice: number;
  averageFillPrice: number | null; notional: number; entryFee: number;
  slippageBps: number | null; riskCash: number; actualRiskPct: number;
  netRewardRisk: number | null;
};

export function planPaperLongEntry(input: PaperEntryPlanInput): PaperEntryPlan {
  const errors: string[] = [];
  const book = input.book;
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 90_000;
  const maxRiskPct = input.maxRiskPct ?? 0.25;
  const maxSlippageBps = input.maxSlippageBps ?? 15;
  const numeric = [input.equity, input.stopPrice, input.targetPrice, input.riskPct, input.feeBps, now, maxAgeMs, maxRiskPct, maxSlippageBps];
  if (numeric.some((value) => !Number.isFinite(value))) errors.push('non-finite paper order input');
  if (!book || !Number.isFinite(book.mid) || book.mid <= 0 || !Number.isFinite(book.timestamp) || book.timestamp <= 0) errors.push('invalid market snapshot');
  if (book && (now < book.timestamp || now - book.timestamp > maxAgeMs)) errors.push('market snapshot is stale');
  if (input.equity <= 0) errors.push('paper equity is unavailable');
  if (input.riskPct <= 0 || input.riskPct > maxRiskPct) errors.push('risk budget exceeds paper policy');
  if (input.feeBps < 0 || input.feeBps > 100) errors.push('fee assumption outside 0..100 bps');
  if (maxSlippageBps < 0 || maxSlippageBps > 500) errors.push('invalid slippage ceiling');
  if (book && !(input.stopPrice > 0 && input.stopPrice < book.mid && input.targetPrice > book.mid)) errors.push('long entry requires stop < market price < target');
  if (errors.length) return { valid: false, errors, quantity: 0, referencePrice: book?.mid ?? 0, averageFillPrice: null, notional: 0, entryFee: 0, slippageBps: null, riskCash: 0, actualRiskPct: 0, netRewardRisk: null };

  const riskBudget = input.equity * input.riskPct / 100;
  const feeReserve = input.feeBps / 10_000;
  const riskPerUnit = (book.mid - input.stopPrice) + book.mid * feeReserve + input.stopPrice * feeReserve;
  const quantity = Math.min(riskBudget / riskPerUnit, input.equity / (book.mid * (1 + feeReserve)));
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('position size is zero or invalid');
  const fill = errors.length ? null : simulateBookSweep(book.asks, 'buy', quantity, input.feeBps);
  if (!fill || !fill.valid || fill.averagePrice === null) errors.push('insufficient ask-side liquidity for a complete paper fill');
  const averageFillPrice = fill?.averagePrice ?? null;
  const slippageBps = fill?.slippagePct === null || fill?.slippagePct === undefined ? null : fill.slippagePct * 100;
  if (slippageBps !== null && slippageBps > maxSlippageBps) errors.push('estimated entry slippage exceeds paper policy');
  const entryFee = fill?.fees ?? 0;
  const notional = fill?.totalValue ?? 0;
  const exitFeeAtStop = averageFillPrice === null ? 0 : quantity * input.stopPrice * input.feeBps / 10_000;
  const riskCash = averageFillPrice === null ? 0 : quantity * (averageFillPrice - input.stopPrice) + entryFee + exitFeeAtStop;
  const actualRiskPct = input.equity > 0 ? riskCash / input.equity * 100 : 0;
  if (actualRiskPct > input.riskPct * 1.05) errors.push('filled price would exceed the approved risk budget');
  const grossReward = averageFillPrice === null ? 0 : quantity * (input.targetPrice - averageFillPrice);
  const targetExitFee = quantity * input.targetPrice * input.feeBps / 10_000;
  const netReward = grossReward - entryFee - targetExitFee;
  const netRewardRisk = riskCash > 0 ? netReward / riskCash : null;
  if (netRewardRisk === null || netRewardRisk < 1.2) errors.push('net reward-to-risk is below 1.2 after fees');
  return { valid: errors.length === 0, errors, quantity: errors.length ? 0 : quantity, referencePrice: book.mid, averageFillPrice, notional, entryFee, slippageBps, riskCash, actualRiskPct, netRewardRisk };
}

export type PaperExitPlanInput = {
  book: OrderBookSnapshot; quantity: number; entryPrice: number; entryFee: number;
  feeBps: number; now?: number; maxAgeMs?: number; maxSlippageBps?: number;
};
export function planPaperLongExit(input: PaperExitPlanInput) {
  const errors: string[] = [];
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 90_000;
  const maxSlippageBps = input.maxSlippageBps ?? 15;
  if ([input.quantity, input.entryPrice, input.entryFee, input.feeBps, now, maxAgeMs, maxSlippageBps].some((x) => !Number.isFinite(x))) errors.push('invalid paper exit inputs');
  if (input.quantity <= 0 || input.entryPrice <= 0 || input.entryFee < 0 || input.feeBps < 0 || input.feeBps > 100) errors.push('paper exit values outside valid ranges');
  if (!input.book || now < input.book.timestamp || now - input.book.timestamp > maxAgeMs) errors.push('market snapshot is stale');
  const fill = errors.length ? null : simulateBookSweep(input.book.bids, 'sell', input.quantity, input.feeBps);
  if (!fill || !fill.valid || fill.averagePrice === null) errors.push('insufficient bid-side liquidity for a complete paper exit');
  const averageExitPrice = fill?.averagePrice ?? null;
  const slippageBps = fill?.slippagePct === null || fill?.slippagePct === undefined ? null : fill.slippagePct * 100;
  if (slippageBps !== null && slippageBps > maxSlippageBps) errors.push('estimated exit slippage exceeds paper policy');
  const exitFee = fill?.fees ?? 0;
  const grossPnl = averageExitPrice === null ? 0 : (averageExitPrice - input.entryPrice) * input.quantity;
  const netPnl = grossPnl - input.entryFee - exitFee;
  return { valid: errors.length === 0, errors, averageExitPrice, exitFee, grossPnl, netPnl, slippageBps, filledQuantity: fill?.filled ?? 0 };
}
