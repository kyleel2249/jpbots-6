import {describe,it,expect} from 'vitest';
import {botCatalog,botDepartmentCoverage,validateBotStart} from './bots';
import {departments,allAgentRoles,platformServices} from './departments';
import {evaluateIntegratedOpportunity} from './intelligence';
import {analyseOrderBook,simulateBookSweep,arbitrateTradeEvidence,capitalAuthority,scalpingGuard,deploymentQualification,validateTradeMemory,canResumeTrading,exchangeMarketSupport,calculateOrderFlowImbalance,classifyPerformance,authorizeTrade,authorizeOrder} from './shared-services';
const book={symbol:'BTCUSDT',timestamp:1,mid:100,bids:[{price:99.99,quantity:8},{price:99.9,quantity:4}],asks:[{price:100.01,quantity:2},{price:100.1,quantity:6}],trades:[{price:100,quantity:5,aggressor:'buy' as const,timestamp:1}]};
describe('shared order book intelligence',()=>{
 it('calculates imbalance, microprice and depth bands',()=>{const r=analyseOrderBook(book);expect(r.obi).toBeCloseTo(.2);expect(r.microprice).not.toBeNull();expect(r.bands).toHaveLength(5);expect(r.tbi).toBe(1);});
 it('computes event-based order-flow imbalance',()=>expect(calculateOrderFlowImbalance([{side:'bid',kind:'add',quantity:10,timestamp:1},{side:'ask',kind:'execute',quantity:5,timestamp:2}]).ofi).toBe(1));
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
 it('classifies underperforming systems conservatively',()=>expect(classifyPerformance({netPnl:20,grossProfit:30,grossLoss:10,maxDrawdownPct:20,trades:200,expectancy:.1,executionSlippageBps:2,signalCalibrationError:.1,regimeStable:true,dataReliable:true}).status).toBe('probation-or-restricted'));
 it('keeps Bitget market categories explicit but adapters disabled',()=>expect(exchangeMarketSupport.liveExecutionEnabled).toBe(false));
});

describe('integrated department and bot registry',()=>{
 it('registers all specialist departments and generated agents',()=>{expect(departments).toHaveLength(12);expect(allAgentRoles).toHaveLength(162);expect(platformServices).toHaveLength(5);});
 it('registers scalping, day and advanced bot families',()=>{expect(botDepartmentCoverage.scalping).toBe(10);expect(botDepartmentCoverage.dayTrading).toBe(10);expect(botCatalog.length).toBe(39);});
 it('keeps every bot paper-only and fails closed on live requests',()=>{const bot=botCatalog[0];const r=validateBotStart(bot,{mode:'restricted-live',market:'spot',timeframe:'1m',configuredRiskPct:.1,testsPassed:true,capitalApproved:true,marketDataFresh:true,exchangeHealthy:true});expect(r.allowed).toBe(false);expect(r.liveEnabled).toBe(false);});
});

describe('central decision and order authority',()=>{
 const healthy={equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true};
 it('allows only paper-eligible trades after independent risk and evidence checks',()=>{const r=authorizeTrade({evidence:[{agent:'trend',stance:'bullish',confidence:90,reason:'aligned'}],checks:{dataFresh:true,signalValid:true,economicsValid:true,exchangeHealthy:true},capital:healthy});expect(r.approved).toBe(true);expect(r.mode).toBe('paper');expect(r.liveExecutionEnabled).toBe(false);});
 it('central risk veto overrides positive agent evidence',()=>{const r=authorizeTrade({evidence:[{agent:'trend',stance:'bullish',confidence:99,reason:'strong'}],checks:{dataFresh:true,signalValid:true,economicsValid:true,exchangeHealthy:true},capital:{...healthy,dailyLossPct:2}});expect(r.approved).toBe(false);expect(r.risk.allowNewEntries).toBe(false);});
 it('rejects order requests when live mode is requested or account is unreconciled',()=>{const r=authorizeOrder({signalApproved:true,capital:{...healthy,accountReconciled:false},market:'spot',quantity:1,minQuantity:.001,quantityStep:.001,liveRequested:true});expect(r.approved).toBe(false);expect(r.liveExecutionEnabled).toBe(false);});
});

describe('integrated market-to-decision pipeline',()=>{\n it('uses normalized price changes and rejects incomplete market quality',()=>{const report=evaluateIntegratedOpportunity({market:{symbol:'BTCUSDT',timestamp:1000,source:'test',timeframe:'1m',prices:Array.from({length:24},(_,i)=>100+i*.1),dataQuality:.95},book, evidence:[],capital:{equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true},signalValid:true,economicsValid:true,exchangeHealthy:true,maxAgeMs:5000,now:1000});expect(report.market.tradeable).toBe(false);expect(report.market.risks).toContain('Spread data unavailable');});
 it('combines market report, order-book pressure, agent evidence and capital veto',()=>{const r=evaluateIntegratedOpportunity({market:{symbol:'BTCUSDT',timestamp:1000,source:'test',timeframe:'1m',prices:Array.from({length:24},(_,i)=>100+i*.2),spreadBps:2,dataQuality:.95},book:{symbol:'BTCUSDT',timestamp:1000,mid:105,bids:[{price:104.99,quantity:8}],asks:[{price:105.01,quantity:2}],trades:[{price:105,quantity:4,aggressor:'buy',timestamp:1000}]},evidence:[{agent:'trend',stance:'bullish',confidence:90,reason:'aligned'}],capital:{equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true},signalValid:true,economicsValid:true,exchangeHealthy:true,maxAgeMs:5000,now:1000});expect(r.tradeable).toBe(true);expect(r.mode).toBe('paper');});
});
