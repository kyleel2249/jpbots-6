import {describe,it,expect} from 'vitest';
import {runEmaBacktest} from './backtesting';
const candles=Array.from({length:120},(_,i)=>{const close=i<50?150-i*.5:125+(i-50)*.8;return {openTime:i*60000,closeTime:i*60000+59999,open:close-.1,high:close+.5,low:close-.5,close,volume:100+i};});
describe('historical backtesting core',()=>{
 it('uses next-candle-open fills and accounts for round-trip fees and slippage',()=>{const r=runEmaBacktest(candles,{fastPeriod:5,slowPeriod:15,feeBps:5,slippageBps:2,initialEquity:10000});expect(r.valid).toBe(true);expect(r.trades.length).toBeGreaterThan(0);expect(r.trades[0].entryTime).toBeGreaterThan(0);expect(r.trades[0].costPct).toBe(.14);expect(r.metrics?.tradeCount).toBe(r.trades.length);expect(r.trades.every(t=>t.side==='long')).toBe(true);expect(r.metrics?.positionMode).toBe('spot long-only');expect(r.trades.every(t=>Number.isFinite(t.maxFavourablePct)&&Number.isFinite(t.maxAdversePct))).toBe(true);});
 it('rejects insufficient or malformed historical data',()=>{const r=runEmaBacktest(candles.slice(0,20),{fastPeriod:5,slowPeriod:15,feeBps:5,slippageBps:2});expect(r.valid).toBe(false);expect(r.metrics).toBeNull();});
 it('rejects invalid parameter ranges',()=>{const r=runEmaBacktest(candles,{fastPeriod:20,slowPeriod:10,feeBps:-1,slippageBps:200});expect(r.valid).toBe(false);expect(r.errors.length).toBeGreaterThan(1);});
});
