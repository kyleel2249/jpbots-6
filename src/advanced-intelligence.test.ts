import {describe,it,expect} from 'vitest';
import {assessAdvancedMarket,calibrateConfidence} from './advanced-intelligence';
const now=1_800_000_000_000;
function input(overrides:Record<string,unknown>={}){const closes=Array.from({length:40},(_,i)=>100+i*.2),volumes=closes.map(()=>10);return {symbol:'BTCUSDT',observedAt:now,closes,volumes,book:{timestamp:now,mid:closes.at(-1)!,bids:[{price:closes.at(-1)!-.01,quantity:100}],asks:[{price:closes.at(-1)!+.01,quantity:10}]},trades:Array.from({length:20},(_,i)=>({price:closes.at(-1)!,quantity:2,aggressor:'buy' as const,timestamp:now-i*1000})),...overrides} as any;}
describe('advanced intelligence',()=>{
 it('builds a bounded research assessment and never enables live trading',()=>{const r=assessAdvancedMarket(input());expect(r.regime.confidence).toBeGreaterThanOrEqual(0);expect(r.regime.confidence).toBeLessThanOrEqual(100);expect(r.liveTradingEnabled).toBe(false);expect(r.liquidity.depthImbalance).toBeGreaterThan(0);});
 it('vetoes stale order books and wide spreads',()=>{const x=input();x.book.timestamp=now-120_000;x.book.asks[0].price=x.book.mid*1.01;const r=assessAdvancedMarket(x);expect(r.adversarial.passed).toBe(false);expect(r.risk.approvedForPaperResearch).toBe(false);});
 it('rejects malformed market data',()=>{const x=input();x.closes[0]=NaN;expect(()=>assessAdvancedMarket(x)).toThrow(/closes/);});
 it('does not pretend to calibrate without labelled samples',()=>{expect(calibrateConfidence([]).available).toBe(false);});
 it('calibrates only after 20 valid labelled outcomes',()=>{const records=Array.from({length:20},(_,i)=>({confidence:80,correct:i<16}));expect(calibrateConfidence(records).available).toBe(true);});
});
