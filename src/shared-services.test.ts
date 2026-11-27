import {describe,it,expect} from 'vitest';
import {analyseOrderBook,simulateBookSweep,arbitrateTradeEvidence,capitalAuthority,scalpingGuard,deploymentQualification,validateTradeMemory,canResumeTrading,exchangeMarketSupport} from './shared-services';
const book={symbol:'BTCUSDT',timestamp:1,mid:100,bids:[{price:99.99,quantity:8},{price:99.9,quantity:4}],asks:[{price:100.01,quantity:2},{price:100.1,quantity:6}],trades:[{price:100,quantity:5,aggressor:'buy' as const,timestamp:1}]};
describe('shared order book intelligence',()=>{
 it('calculates imbalance, microprice and depth bands',()=>{const r=analyseOrderBook(book);expect(r.obi).toBeCloseTo(.25);expect(r.microprice).not.toBeNull();expect(r.bands).toHaveLength(5);expect(r.tbi).toBe(1);});
 it('simulates depth consumption and partial fills',()=>{const r=simulateBookSweep(book.asks,'buy',3,10);expect(r.valid).toBe(true);expect(r.filled).toBe(3);expect(r.fees).toBeGreaterThan(0);});
});
describe('capital authority and arbitration',()=>{
 it('vetoes entries on stale data and unreconciled account',()=>{const r=capitalAuthority({equity:900,peakEquity:1000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:5,exchangeHealthy:true,dataFresh:false,accountReconciled:false});expect(r.allowNewEntries).toBe(false);expect(r.reasons).toContain('account state not reconciled');});
 it('does not use majority vote to bypass missing evidence or risk veto',()=>{const r=arbitrateTradeEvidence([{agent:'trend',stance:'bullish',confidence:95,reason:'uptrend'},{agent:'momentum',stance:'bullish',confidence:90,reason:'momentum'}],{dataFresh:true,signalValid:false,economicsValid:true,riskApproved:true,exchangeHealthy:true});expect(r.decision).toBe('reject');});
 it('blocks scalps with bad spreads and duplicate entries',()=>expect(scalpingGuard({spreadBps:30,maxSpreadBps:10,grossRewardRisk:2,estimatedCostRisk:.2,extensionPct:.1,maxExtensionPct:.5,cooldownActive:false,duplicatePosition:true,dailyLossLimitHit:false,exchangeHealthy:true,dataFresh:true,latencyMs:10,maxLatencyMs:100,volatilityShock:false}).allowed).toBe(false));
});
describe('testing, memory and recovery',()=>{
 it('never promotes without all stages and explicit approval',()=>expect(deploymentQualification({unitTests:true,backtestTrades:200,backtestNetExpectancy:1,oosTrades:100,oosNetExpectancy:.5,walkForward:true,stress:true,paperTrades:200,paperNetExpectancy:.2,paperMaxDrawdownPct:2,stable:true,liveTestEvidence:false,explicitApproval:true}).eligible).toBe(false));
 it('requires complete trade memory fields',()=>expect(validateTradeMemory({id:'1',timestamp:1,exchange:'Bitget',market:'spot',symbol:'BTCUSDT',strategy:'trend',agent:'test',regime:'bull',signal:'long',confidence:80,entry:100,stop:95,target:110,quantity:1,leverage:1,entryTime:1,fees:1,funding:0,slippage:0,strategyVersion:'v1'}).valid).toBe(true));
 it('blocks restart until reconciled and approved',()=>expect(canResumeTrading({accountReconciled:false,marketDataFresh:true,exchangeHealthy:true,incidentAcknowledged:true,operatorApproved:true}).canResume).toBe(false));
 it('keeps Bitget market categories explicit but adapters disabled',()=>expect(exchangeMarketSupport.liveExecutionEnabled).toBe(false));
});
