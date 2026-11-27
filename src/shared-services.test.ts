import {describe,it,expect} from 'vitest';
import {botCatalog,botDepartmentCoverage,validateBotStart} from './bots';
import {departments,allAgentRoles,platformServices} from './departments';
import {evaluateIntegratedOpportunity,monteCarloRisk,stressPortfolio,netReward,signalDecision,validateOrder,deploymentStage} from './intelligence';
import {defaultRisk} from './engine';
import {analyseOrderBook,simulateBookSweep,arbitrateTradeEvidence,capitalAuthority,scalpingGuard,deploymentQualification,validateTradeMemory,canResumeTrading,exchangeMarketSupport,calculateOrderFlowImbalance,classifyPerformance,agentTrustScore,defaultCapitalPolicy,authorizeTrade,authorizeOrder} from './shared-services';
const book={symbol:'BTCUSDT',timestamp:1,mid:100,bids:[{price:99.99,quantity:8},{price:99.9,quantity:4}],asks:[{price:100.01,quantity:2},{price:100.1,quantity:6}],trades:[{price:100,quantity:5,aggressor:'buy' as const,timestamp:1}]};
describe('shared order book intelligence',()=>{
 it('calculates imbalance, microprice and depth bands',()=>{const r=analyseOrderBook(book);expect(r.obi).toBeCloseTo(.2);expect(r.microprice).not.toBeNull();expect(r.bands).toHaveLength(5);expect(r.tbi).toBe(1);});
 it('rejects invalid mid prices and flags crossed order books',()=>{expect(()=>analyseOrderBook({...book,mid:0})).toThrow();const r=analyseOrderBook({...book,bids:[{price:100.02,quantity:5}],asks:[{price:100,quantity:4}]});expect(r.liquidityState).toBe('invalid');expect(r.spreadBps).toBeNull();expect(r.warnings).toContain('Crossed or locked book');});
 it('computes event-based order-flow imbalance',()=>expect(calculateOrderFlowImbalance([{side:'bid',kind:'add',quantity:10,timestamp:1},{side:'ask',kind:'execute',quantity:5,timestamp:2}]).ofi).toBe(1));
 it('simulates depth consumption and partial fills',()=>{const r=simulateBookSweep(book.asks,'buy',3,10);expect(r.valid).toBe(true);expect(r.filled).toBe(3);expect(r.fees).toBeGreaterThan(0);});
});
describe('capital authority and arbitration',()=>{
 it('vetoes entries on stale data and unreconciled account',()=>{const r=capitalAuthority({equity:900,peakEquity:1000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:5,exchangeHealthy:true,dataFresh:false,accountReconciled:false});expect(r.allowNewEntries).toBe(false);expect(r.reasons).toContain('account state not reconciled');});
 it('does not use majority vote to bypass missing evidence or risk veto',()=>{const r=arbitrateTradeEvidence([{agent:'trend',stance:'bullish',confidence:95,reason:'uptrend'},{agent:'momentum',stance:'bullish',confidence:90,reason:'momentum'}],{dataFresh:true,signalValid:false,economicsValid:true,riskApproved:true,exchangeHealthy:true});expect(r.decision).toBe('reject');});
 it('rejects malformed or uncalibrated agent evidence',()=>{const r=arbitrateTradeEvidence([{agent:'trend',stance:'bullish',confidence:150,reason:'bad confidence'}],{dataFresh:true,signalValid:true,economicsValid:true,riskApproved:true,exchangeHealthy:true});expect(r.decision).toBe('reject');expect(r.blockers).toContain('invalid agent evidence');});
 it('rejects unresolved material disagreement between independent agents',()=>{const r=arbitrateTradeEvidence([{agent:'trend',stance:'bullish',confidence:80,reason:'up'},{agent:'orderflow',stance:'bearish',confidence:78,reason:'sell pressure'}],{dataFresh:true,signalValid:true,economicsValid:true,riskApproved:true,exchangeHealthy:true});expect(r.decision).toBe('reject');expect(r.blockers).toContain('material agent disagreement requires additional evidence');});
 it('blocks scalps with bad spreads and duplicate entries',()=>expect(scalpingGuard({spreadBps:30,maxSpreadBps:10,grossRewardRisk:2,estimatedCostRisk:.2,extensionPct:.1,maxExtensionPct:.5,cooldownActive:false,duplicatePosition:true,dailyLossLimitHit:false,exchangeHealthy:true,dataFresh:true,latencyMs:10,maxLatencyMs:100,volatilityShock:false}).allowed).toBe(false));
});
describe('testing, memory and recovery',()=>{
 it('never promotes without all stages and explicit approval',()=>expect(deploymentQualification({unitTests:true,backtestTrades:200,backtestNetExpectancy:1,oosTrades:100,oosNetExpectancy:.5,walkForward:true,stress:true,paperTrades:200,paperNetExpectancy:.2,paperMaxDrawdownPct:2,stable:true,liveTestEvidence:false,explicitApproval:true}).eligible).toBe(false));
 it('requires complete trade memory fields',()=>expect(validateTradeMemory({id:'1',timestamp:1,exchange:'Bitget',market:'spot',symbol:'BTCUSDT',strategy:'trend',agent:'test',regime:'bull',signal:'long',confidence:80,entry:100,stop:95,target:110,quantity:1,leverage:1,entryTime:1,fees:1,funding:0,slippage:0,strategyVersion:'v1'}).valid).toBe(true));
 it('blocks restart until reconciled and approved',()=>expect(canResumeTrading({accountReconciled:false,marketDataFresh:true,exchangeHealthy:true,incidentAcknowledged:true,operatorApproved:true}).canResume).toBe(false));
 it('rejects corrupted or non-finite trade memory fields',()=>{const record={id:'1',timestamp:1,exchange:'x',market:'spot',symbol:'BTCUSDT',strategy:'s',agent:'a',regime:'trend',signal:'long',confidence:90,entry:100,stop:95,target:110,quantity:1,leverage:1,entryTime:1,fees:0,funding:0,slippage:0,strategyVersion:'1'};expect(validateTradeMemory({...record,confidence:Number.NaN}).valid).toBe(false);expect(validateTradeMemory({...record,fees:-1}).valid).toBe(false);});
 it('rejects malformed recovery-state flags',()=>expect(canResumeTrading({accountReconciled:'false' as any,marketDataFresh:true,exchangeHealthy:true,incidentAcknowledged:true,operatorApproved:true}).canResume).toBe(false));
 it('classifies underperforming systems conservatively',()=>expect(classifyPerformance({netPnl:20,grossProfit:30,grossLoss:10,maxDrawdownPct:20,trades:200,expectancy:.1,executionSlippageBps:2,signalCalibrationError:.1,regimeStable:true,dataReliable:true}).status).toBe('probation-or-restricted'));
 it('keeps Bitget market categories explicit but adapters disabled',()=>expect(exchangeMarketSupport.liveExecutionEnabled).toBe(false));
});

describe('integrated department and bot registry',()=>{
 it('registers all specialist departments and generated agents',()=>{expect(departments).toHaveLength(13);expect(allAgentRoles).toHaveLength(186);expect(allAgentRoles.map(r=>r.name)).toContain('Global Market Discovery Agent');expect(allAgentRoles.map(r=>r.name)).toContain('On-Chain Network Intelligence Agent');expect(departments.find(d=>d.id==='institutional')?.agents).toHaveLength(12);expect(platformServices).toHaveLength(5);});
 it('registers scalping, day and advanced bot families',()=>{expect(botDepartmentCoverage.scalping).toBe(10);expect(botDepartmentCoverage.dayTrading).toBe(10);expect(botCatalog.length).toBe(40);});
 it('rejects bot starts with non-finite risk budgets',()=>{const bot=botCatalog[0];const r=validateBotStart(bot,{mode:'paper',market:'spot',timeframe:'1m',configuredRiskPct:Number.NaN,testsPassed:true,capitalApproved:true,marketDataFresh:true,exchangeHealthy:true});expect(r.allowed).toBe(false);expect(r.reasons).toContain('risk budget outside bot policy');});
 it('keeps every bot paper-only and fails closed on live requests',()=>{const bot=botCatalog[0];const r=validateBotStart(bot,{mode:'restricted-live',market:'spot',timeframe:'1m',configuredRiskPct:.1,testsPassed:true,capitalApproved:true,marketDataFresh:true,exchangeHealthy:true});expect(r.allowed).toBe(false);expect(r.liveEnabled).toBe(false);});
});

describe('central decision and order authority',()=>{
 const healthy={equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true};
 it('allows only paper-eligible trades after independent risk and evidence checks',()=>{const r=authorizeTrade({evidence:[{agent:'trend',stance:'bullish',confidence:90,reason:'aligned'}],checks:{dataFresh:true,signalValid:true,economicsValid:true,exchangeHealthy:true},capital:healthy,proposedRiskPct:.2});expect(r.approved).toBe(true);expect(r.mode).toBe('paper');expect(r.liveExecutionEnabled).toBe(false);});
 it('fails closed when central capital policy values are invalid',()=>{const r=capitalAuthority(healthy,{...defaultCapitalPolicy,maxRiskPerTradePct:Number.NaN});expect(r.allowNewEntries).toBe(false);expect(r.killSwitch).toBe(true);expect(r.reasons).toContain('invalid capital policy configuration');});
 it('fails closed when account equity or risk metrics are non-finite',()=>{const r=capitalAuthority({...healthy,equity:Number.NaN});expect(r.allowNewEntries).toBe(false);expect(r.killSwitch).toBe(true);expect(r.reasons).toContain('invalid or unavailable account risk metrics');});
 it('central risk veto overrides positive agent evidence',()=>{const r=authorizeTrade({evidence:[{agent:'trend',stance:'bullish',confidence:99,reason:'strong'}],checks:{dataFresh:true,signalValid:true,economicsValid:true,exchangeHealthy:true},capital:{...healthy,dailyLossPct:2},proposedRiskPct:.2});expect(r.approved).toBe(false);expect(r.risk.allowNewEntries).toBe(false);});
 it('routes venue validation through capital authorization and remains paper-only',()=>{const caps={spot:true,margin:true,usdtM:true,coinM:true,usdcM:true,postOnly:true,reduceOnly:true};const base={market:'spot' as const,quantity:1,minQuantity:.001,quantityStep:.001,type:'market' as const,signalApproved:true,capital:healthy,proposedRiskPct:.2};const paper=validateOrder({...base,mode:'paper'},caps);expect(paper.valid).toBe(true);expect(paper.liveExecutionEnabled).toBe(false);const live=validateOrder({...base,mode:'live'},caps);expect(live.valid).toBe(false);});
 it('rejects order requests when live mode is requested or account is unreconciled',()=>{const r=authorizeOrder({signalApproved:true,capital:{...healthy,accountReconciled:false},proposedRiskPct:.2,market:'spot',quantity:1,minQuantity:.001,quantityStep:.001,liveRequested:true});expect(r.approved).toBe(false);expect(r.liveExecutionEnabled).toBe(false);});
});

describe('integrated market-to-decision pipeline',()=>{
 it('uses normalized price changes and rejects incomplete market quality',()=>{const report=evaluateIntegratedOpportunity({market:{symbol:'BTCUSDT',timestamp:1000,source:'test',timeframe:'1m',prices:Array.from({length:24},(_,i)=>100+i*.1),dataQuality:.95},book, evidence:[],capital:{equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true},signalValid:true,economicsValid:true,exchangeHealthy:true,proposedRiskPct:.2,maxAgeMs:5000,now:1000});expect(report.market.tradeable).toBe(false);expect(report.market.risks).toContain('Spread data unavailable or invalid');});
 it('combines market report, order-book pressure, agent evidence and capital veto',()=>{const r=evaluateIntegratedOpportunity({market:{symbol:'BTCUSDT',timestamp:1000,source:'test',timeframe:'1m',prices:Array.from({length:24},(_,i)=>100+i*.2),spreadBps:2,dataQuality:.95},book:{symbol:'BTCUSDT',timestamp:1000,mid:105,bids:[{price:104.99,quantity:8}],asks:[{price:105.01,quantity:2}],trades:[{price:105,quantity:4,aggressor:'buy',timestamp:1000}]},evidence:[{agent:'trend',stance:'bullish',confidence:90,reason:'aligned'}],capital:{equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true},signalValid:true,economicsValid:true,exchangeHealthy:true,proposedRiskPct:.2,maxAgeMs:5000,now:1000});expect(r.tradeable).toBe(true);expect(r.mode).toBe('paper');});
});

describe('portfolio survival simulations',()=>{
 it('calculates risk of ruin per simulated path, not per time step',()=>{const r=monteCarloRisk([-100],100,20,7);expect(r.ruinProbability).toBe(1);});
 it('nets signed exposures within correlation groups in stress scenarios',()=>{const r=stressPortfolio([{notional:100,shockPct:-10,correlationGroup:'BTC'},{notional:-50,shockPct:-10,correlationGroup:'BTC'},{notional:100,shockPct:-10,correlationGroup:'ETH'}]);expect(r.stressedLoss).toBe(15);expect(r.groupPnl.BTC).toBe(-5);});
});

describe('per-trade risk authority',()=>{
 const healthy={equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true};
 it('rejects a position whose proposed risk exceeds the central policy cap',()=>{const r=authorizeTrade({evidence:[{agent:'trend',stance:'bullish',confidence:99,reason:'strong'}],checks:{dataFresh:true,signalValid:true,economicsValid:true,exchangeHealthy:true},capital:healthy,proposedRiskPct:.5});expect(r.approved).toBe(false);expect(r.risk.reasons).toContain('proposed per-trade risk exceeds capital policy');});
 it('fails closed when a proposed trade omits its risk budget',()=>{const r=authorizeOrder({signalApproved:true,capital:healthy,proposedRiskPct:0,market:'spot',quantity:1,minQuantity:.001,quantityStep:.001});expect(r.approved).toBe(false);expect(r.capitalVeto).toBe(true);});
});

describe('net trade economics',()=>{
 it('deducts entry and exit fees and slippage from reward-to-risk',()=>{const r=netReward(100,110,95,1,10,5);expect(r?.net).toBeCloseTo(9.685);expect(r?.netRewardRisk).toBeGreaterThan(1);});
 it('rejects non-finite inputs and zero stop distance',()=>{expect(netReward(100,110,100,1,10,5)).toBeNull();expect(netReward(Number.NaN,110,95,1,10,5)).toBeNull();});
});

describe('performance data integrity',()=>{
 it('prevents invalid performance metrics from qualifying',()=>{const r=classifyPerformance({netPnl:Number.NaN,grossProfit:30,grossLoss:10,maxDrawdownPct:5,trades:300,expectancy:1,executionSlippageBps:2,signalCalibrationError:.1,regimeStable:true,dataReliable:true});expect(r.status).toBe('probation-or-restricted');expect(r.failures).toContain('invalid or incomplete performance metrics');});
 it('returns zero trust for invalid task counters',()=>expect(agentTrustScore({successfulTasks:10,failedTasks:-1,policyViolations:0,dataErrors:0,decisionReversals:0})).toBe(0));
});

describe('legacy signal helper cannot bypass central authority',()=>{
 const healthy={equity:10000,peakEquity:10000,dailyLossPct:0,weeklyLossPct:0,monthlyLossPct:0,openPositions:0,correlatedExposurePct:0,leverage:1,marginUtilisationPct:10,exchangeHealthy:true,dataFresh:true,accountReconciled:true};
 it('rejects legacy signals without entry stop target and cost economics',()=>{const agent={id:1,name:'trend',division:'Market Intelligence',strategy:'trend',symbol:'BTCUSDT',timeframe:'1m',status:'READY' as const,confidence:90,trades:100,winRate:60,pnl:100,risk:.2};const signal={id:1,time:'now',symbol:'BTCUSDT',side:'LONG' as const,strategy:'trend',confidence:90,agent:'trend',status:'WATCH' as const};const r=signalDecision(signal,agent,healthy,defaultRisk,.2);expect(r.approved).toBe(false);expect(r.reasons).toContain('net reward/risk economics unacceptable');});
});

describe('deployment qualification cannot enable live execution',()=>{
 it('rejects non-finite historical and paper evidence',()=>{const r=deploymentStage({tests:true,backtestTrades:Number.NaN,backtestExpectancy:1,oosTrades:60,oosExpectancy:.5,walkForward:true,stress:true,paperTrades:200,paperExpectancy:.5,paperDrawdown:2,stable:true,explicitApproval:true});expect(r.stage).toBe('paper');expect(r.reasons).toContain('invalid validation evidence');});
 it('returns review-only status even after all qualification checks',()=>{const r=deploymentStage({tests:true,backtestTrades:200,backtestExpectancy:1,oosTrades:60,oosExpectancy:.5,walkForward:true,stress:true,paperTrades:200,paperExpectancy:.5,paperDrawdown:2,stable:true,explicitApproval:true});expect(r.stage).toBe('restricted-live-review');expect(r.liveExecutionEnabled).toBe(false);});
});

describe('shared deployment evidence integrity',()=>{
 it('rejects non-finite test evidence',()=>{const r=deploymentQualification({unitTests:true,backtestTrades:200,backtestNetExpectancy:1,oosTrades:60,oosNetExpectancy:.5,walkForward:true,stress:true,paperTrades:200,paperNetExpectancy:.5,paperMaxDrawdownPct:Number.NaN,stable:true,liveTestEvidence:true,explicitApproval:true});expect(r.eligible).toBe(false);expect(r.failed).toContain('invalid deployment evidence');expect(r.liveExecutionEnabled).toBe(false);});
});
