import {describe,it,expect} from 'vitest';
import {analyseAmdSession} from './amd-session-strategy';
import type {StrategyCandle} from './institutional-strategy';
const day=Date.UTC(2026,0,5);
function candle(minute:number,open:number,high:number,low:number,close:number,volume=100):StrategyCandle{return {openTime:day+minute*60_000-300_000,closeTime:day+minute*60_000-1,open,high,low,close,volume};}
function session(last?:StrategyCandle){const rows:StrategyCandle[]=[];for(let m=185;m<360;m+=5)rows.push(candle(m,100,101,99,100.2));for(let m=365,i=0;m<540;m+=5,i++)rows.push(candle(m,100+(i%3)*.1,102,99,100.1+(i%3)*.1));for(let m=545;m<600;m+=5)rows.push(candle(m,100,101,99.5,100.1));if(last)rows.push(last);return rows;}
describe('AMD session strategy',()=>{
 it('strictly blocks entries during accumulation and manipulation',()=>{
  const rows=session();
  expect(analyseAmdSession(rows,day+4*60*60_000,'UTC').entryAllowed).toBe(false);
  expect(analyseAmdSession(rows,day+7*60*60_000,'UTC').entryAllowed).toBe(false);
  expect(analyseAmdSession(rows,day+4*60*60_000,'UTC').phase).toBe('accumulation');
  expect(analyseAmdSession(rows,day+7*60*60_000,'UTC').phase).toBe('manipulation');
 });
 it('requires CISD or MSS and a manipulation-range sweep or strong PD-array retest',()=>{
  const rows=session(candle(605,100,104,98,103.5,250));
  const result=analyseAmdSession(rows,day+606*60_000,'UTC');
  expect(result.phase).toBe('distribution');
  expect(result.structure.confirmed).toBe('bullish');
  expect(result.sweeps.low).toBe(true);
  expect(result.qualified).toBe(true);
  expect(result.direction).toBe('bullish');
 });
 it('does not qualify distribution on time alone',()=>{
  const result=analyseAmdSession(session(),day+600*60_000,'UTC');
  expect(result.phase).toBe('distribution');
  expect(result.entryAllowed).toBe(false);
  expect(result.qualified).toBe(false);
 });
 it('rejects invalid timezones and supports timezone-local session clocks',()=>{
  expect(analyseAmdSession([],day,'Bad/Timezone').reason[0]).toContain('Invalid');
  const result=analyseAmdSession(session(),day+10*60*60_000,'Africa/Accra');
  expect(result.phase).toBe('distribution');
  expect(result.timezone).toBe('Africa/Accra');
 });
});
