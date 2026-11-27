import {describe,it,expect} from 'vitest';
import {defaultRisk,estimatePositionSize,isWeekday,validateSignal} from './engine';
import type {Agent,Signal} from './types';
const agent:Agent={id:1,roleId:'test:Test',enabled:true,name:'Test',division:'Scalping',strategy:'Test strategy',symbol:'BTC/USDT',timeframe:'1m',status:'SCANNING',confidence:90,trades:0,winRate:0,pnl:0,risk:.2};
const signal:Signal={id:1,time:'12:00',symbol:'BTC/USDT',side:'LONG',strategy:'Test',confidence:90,agent:'Test',status:'WATCH'};
describe('risk and sizing controls',()=>{
 it('approves a high-confidence signal within limits',()=>expect(validateSignal(signal,agent,defaultRisk,0,0).approved).toBe(true));
 it('rejects low-confidence signals',()=>expect(validateSignal({...signal,confidence:60},agent,defaultRisk,0,0).approved).toBe(false));
 it('rejects non-finite signal confidence and account metrics',()=>{expect(validateSignal({...signal,confidence:Number.NaN},agent,defaultRisk,0,0).approved).toBe(false);expect(validateSignal(signal,agent,defaultRisk,Number.NaN,0).approved).toBe(false);});
 it('rejects when the position cap is reached',()=>expect(validateSignal(signal,agent,defaultRisk,4,0).approved).toBe(false));
 it('rejects after the daily loss limit',()=>expect(validateSignal(signal,agent,defaultRisk,0,2).approved).toBe(false));
 it('sizes positions from cash risk divided by stop distance',()=>expect(estimatePositionSize(10000,100,95,.25)).toBe(5));
 it('returns zero for invalid sizing inputs',()=>{expect(estimatePositionSize(10000,100,100,.25)).toBe(0);expect(estimatePositionSize(10000,100,95,150)).toBe(0);});
 it('recognises Monday and Friday as weekdays',()=>{expect(isWeekday(new Date('2026-11-23T12:00:00Z'))).toBe(true);expect(isWeekday(new Date('2026-11-27T12:00:00Z'))).toBe(true)});
 it('rejects weekend dates under the default schedule',()=>expect(isWeekday(new Date('2026-11-28T12:00:00Z'))).toBe(false));
});
