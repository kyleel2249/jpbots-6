import {describe,it,expect} from 'vitest';
import {buildDivisionMarketEvidence,buildLongPaperLevels} from './adaptive-division-runtime';
import type {Candle} from './global-market-intelligence';
const make=(n:number,step:number,start:number):Candle[]=>Array.from({length:n},(_,i)=>{const close=start+i*step;return {openTime:i*step,open:close-step*.3,high:close+step*.5,low:close-step*.5,close,volume:100+i*2,closeTime:i*step+1};});
const book={symbol:'BTCUSDT',timestamp:100000,mid:100,bids:[{price:99.99,quantity:100},{price:99.98,quantity:90}],asks:[{price:100.01,quantity:80},{price:100.02,quantity:70}],trades:[]} as any;
describe('autonomous division evidence',()=>{
 it('requires closed multi-timeframe candles and a valid two-sided book',()=>{expect(()=>buildDivisionMarketEvidence({symbol:'BTCUSDT',assetClass:'crypto-spot',candles1m:[],candles5m:[],candles1h:[],book,observedAt:100000})).toThrow(/closed candles/);});
 it('generates distinct horizon directions and bounded evidence',()=>{const e=buildDivisionMarketEvidence({symbol:'BTCUSDT',assetClass:'crypto-spot',candles1m:make(60,.1,100),candles5m:make(60,.2,100),candles1h:make(40,.5,100),book,observedAt:100000});expect(e.price).toBe(100);expect(e.spreadBps).toBeGreaterThan(0);expect(e.scalpingDirection).toBe('long');expect(e.dayTradingDirection).toBe('long');});
 it('creates ATR-derived levels and blocks unsupported short spot entries',()=>{const e=buildDivisionMarketEvidence({symbol:'BTCUSDT',assetClass:'crypto-spot',candles1m:make(60,.1,100),candles5m:make(60,.2,100),candles1h:make(40,.5,100),book,observedAt:100000});const p=buildLongPaperLevels(e,'day-trading');expect(p.valid).toBe(true);expect(p.stop).toBeLessThan(e.price);expect(p.target).toBeGreaterThan(e.price);expect(buildLongPaperLevels({...e,direction:'short'},'day-trading').valid).toBe(false);});
});
