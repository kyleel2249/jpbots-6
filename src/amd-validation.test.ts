import {describe,it,expect} from 'vitest';
import {replayAmdSessions,amdCostSensitivity,optimiseAmdParameters,walkForwardAmd,arbitrateAmdOpportunity,buildAmdForwardRecord} from './amd-validation';
import {analyseAmdSession} from './amd-session-strategy';
import type {StrategyCandle} from './institutional-strategy';
const DAY=Date.UTC(2026,0,1);
function makeDay(day:number):StrategyCandle[]{
 const out:StrategyCandle[]=[];const base=DAY+day*86400000;
 const add=(minute:number,o:number,h:number,l:number,c:number,v=100)=>out.push({openTime:base+minute*60000,closeTime:base+(minute+5)*60000-1,open:o,high:h,low:l,close:c,volume:v});
 for(let m=180;m<360;m+=5)add(m,100,101,99,100.2);
 for(let m=360,i=0;m<540;m+=5,i++)add(m,i===35?100.5:100,102, i===35?99.5:99, i===35?100.2:100.1);
 for(let m=540,i=0;m<720;m+=5,i++){if(i===10)add(m,100.2,101.8,98.5,101.5,250);else if(i>10){const o=101.5+(i-11)*.35,c=o+.35;add(m,o,c+.2,o-.2,c);}else add(m,101.5,102.1,101.2,101.8);}
 return out;
}
function series(days=24){return Array.from({length:days},(_,i)=>makeDay(i)).flat();}
describe('AMD validation suite',()=>{
 it('replays complete sessions without look-ahead and produces risk-normalised metrics',()=>{
  const candles=series(12),result=replayAmdSessions(candles,{timezone:'Africa/Accra'});
  expect(result.valid).toBe(true);expect(result.sessions).toBe(12);expect(result.qualifiedSignals).toBeGreaterThan(0);
  expect(result.metrics?.trades).toBeGreaterThan(0);expect(result.uncertainty?.sampleAdequate).toBe(true);expect(result.metrics?.averageMfeR).toBeGreaterThan(0);expect(result.trades[0].entryTime).toBeGreaterThan(result.trades[0].signalTime);
  expect(result.trades[0].netR).toBeTypeOf('number');expect(result.metrics?.maxDrawdownPct).toBeGreaterThanOrEqual(0);
 });
 it('rejects malformed and non-monotonic candle histories',()=>{
  const bad=[...series(2)];bad[5]={...bad[5],high:1,low:10};
  const result=replayAmdSessions(bad);expect(result.valid).toBe(false);expect(result.errors.length).toBeGreaterThan(0);
 });
 it('compares timezone, sweep and PD Array parameters using chronological holdout',()=>{
  const result=optimiseAmdParameters(series(24),{timezones:['UTC','Africa/Accra'],sweepSensitivitiesBps:[0,5],arrayStrengths:[65,75],minTrainTrades:2,minHoldoutTrades:1});
  expect(result.split.holdoutUntouchedDuringSelection).toBe(true);expect(result.candidateCount).toBe(8);expect(result.invalidTimezones).toEqual([]);
  expect(result.best?.holdout.trades).toBeGreaterThan(0);expect(amdCostSensitivity(series(12),result.best!.config)).toHaveLength(3);
 });
 it('runs sequential walk-forward folds and preserves a final untouched segment',()=>{
  const result=walkForwardAmd(series(24),2);
  expect(result.folds).toHaveLength(2);expect(result.finalUntouchedOutOfSample.candles).toBeGreaterThan(0);
  expect(result.liveExecutionEnabled).toBe(false);
 });
 it('rejects strategy-direction conflict and records missed or rejected forward opportunities',()=>{
  const candles=series(1),assessment=analyseAmdSession(candles, candles[candles.length-1].closeTime,'Africa/Accra');
  const rejected=arbitrateAmdOpportunity({amd:assessment,strategy:{valid:true,side:'short',confidence:90}});
  expect(rejected.approved).toBe(false);
  const record=buildAmdForwardRecord({symbol:'BTCUSDT',assessment,observedAt:candles.at(-1)!.closeTime,paperEnabled:false});
  expect(assessment.qualified).toBe(true);expect(record.status).toBe('missed');expect(record.paperOrderAttempted).toBe(false);
 });
});
