import {describe,it,expect} from 'vitest';
import {analyseMarketChart,scoreGlobalOpportunity,rankGlobalInstruments,type Candle,type GlobalInstrument} from './global-market-intelligence';
function candles(direction:'up'|'down'='up'):Candle[]{return Array.from({length:50},(_,i)=>{const close=direction==='up'?100+i:150-i;return {openTime:i,open:close-.4,high:close+1,low:close-1,close,volume:i>44?200:100};});}
describe('global market intelligence',()=>{
 it('extracts trend, momentum, volume and chart levels from candles',()=>{const a=analyseMarketChart(candles());expect(a.trend).toBe('bullish');expect(a.ema9).toBeGreaterThan(a.ema21!);expect(a.rsi14).toBe(100);expect(a.volumeRatio).toBeGreaterThan(1);expect(a.support).toBeGreaterThan(0);expect(a.resistance).toBeGreaterThan(a.support!);});
 it('detects bearish trend independently',()=>expect(analyseMarketChart(candles('down')).trend).toBe('bearish'));
 it('ranks opportunities with evidence and bounded scores',()=>{const chart=analyseMarketChart(candles());const score=scoreGlobalOpportunity({chart,change24hPct:5,volume24hUsd:10_000_000,liquidityUsd:5_000_000});expect(score.direction).toBe('bullish');expect(score.score).toBeGreaterThan(40);expect(score.score).toBeLessThanOrEqual(100);});
 it('orders instruments by available liquidity/volume',()=>{const rows=[{id:'a',symbol:'A',name:'A',assetClass:'equity',venue:'x',observedAt:1,source:'x',tradable:false,volume24hUsd:1},{id:'b',symbol:'B',name:'B',assetClass:'equity',venue:'x',observedAt:1,source:'x',tradable:false,volume24hUsd:5}] as GlobalInstrument[];expect(rankGlobalInstruments(rows).map(x=>x.id)).toEqual(['b','a']);});
});
