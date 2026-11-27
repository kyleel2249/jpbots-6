/** Shared platform services. Pure deterministic functions; adapters/storage/workers are separate infrastructure concerns. */
export type BookLevel={price:number;quantity:number};
export type TradePrint={price:number;quantity:number;aggressor:'buy'|'sell'|'unknown';timestamp:number};
export type OrderBookSnapshot={symbol:string;timestamp:number;mid:number;bids:BookLevel[];asks:BookLevel[];trades?:TradePrint[];previous?:{bids:BookLevel[];asks:BookLevel[]}};
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const safeRatio=(n:number,d:number)=>d>0?n/d:0;
export function analyseOrderBook(b:OrderBookSnapshot){
 if(!b||typeof b.symbol!=='string'||!b.symbol||!Number.isFinite(b.mid)||b.mid<=0||!Number.isFinite(b.timestamp)||b.timestamp<=0||!Array.isArray(b.bids)||!Array.isArray(b.asks))throw new Error('Invalid order-book snapshot');
 const valid=(x:BookLevel)=>Number.isFinite(x.price)&&x.price>0&&Number.isFinite(x.quantity)&&x.quantity>0;
 const bids=b.bids.filter(valid).sort((x,y)=>y.price-x.price),asks=b.asks.filter(valid).sort((x,y)=>x.price-y.price);
 const bid=sum(bids.map(x=>x.quantity)),ask=sum(asks.map(x=>x.quantity)),total=bid+ask,obi=safeRatio(bid-ask,total);
 const weighted=(levels:BookLevel[])=>sum(levels.map(x=>x.quantity/(1+Math.abs(x.price-b.mid)/b.mid*100)));
 const wb=weighted(bids),wa=weighted(asks),wobi=safeRatio(wb-wa,wb+wa);
 const bands=[.0005,.001,.0025,.005,.01].map(distance=>({distancePct:distance*100,bidDepth:sum(bids.filter(x=>x.price>=b.mid*(1-distance)).map(x=>x.quantity)),askDepth:sum(asks.filter(x=>x.price<=b.mid*(1+distance)).map(x=>x.quantity))}));
 const bestBid=bids[0],bestAsk=asks[0],crossed=!!(bestBid&&bestAsk&&bestBid.price>=bestAsk.price),spreadBps=bestBid&&bestAsk&&!crossed?safeRatio(bestAsk.price-bestBid.price,b.mid)*10000:null;
 const microprice=bestBid&&bestAsk&&!crossed&&bestBid.quantity+bestAsk.quantity>0?(bestAsk.price*bestBid.quantity+bestBid.price*bestAsk.quantity)/(bestBid.quantity+bestAsk.quantity):null;
 const prints=(b.trades??[]).filter(t=>Number.isFinite(t.price)&&t.price>0&&Number.isFinite(t.quantity)&&t.quantity>0&&Number.isFinite(t.timestamp));
 const buyVolume=sum(prints.filter(t=>t.aggressor==='buy').map(t=>t.quantity)),sellVolume=sum(prints.filter(t=>t.aggressor==='sell').map(t=>t.quantity)),tbi=safeRatio(buyVolume-sellVolume,buyVolume+sellVolume);
 let ofi:number|null=null;
 if(b.previous){const oldBids=b.previous.bids.filter(valid),oldAsks=b.previous.asks.filter(valid),oldBid=sum(oldBids.map(x=>x.quantity)),oldAsk=sum(oldAsks.map(x=>x.quantity));ofi=safeRatio((bid-oldBid)-(ask-oldAsk),Math.abs(bid-oldBid)+Math.abs(ask-oldAsk));}
 const warnings=[...(crossed?['Crossed or locked book']:[]),...(spreadBps!==null&&spreadBps>20?['Wide spread']:[]),...(bids.length===0||asks.length===0?['Incomplete book side']:[])];
 return {symbol:b.symbol,timestamp:b.timestamp,bestBid:bestBid??null,bestAsk:bestAsk??null,spreadBps,obi,wobi,bands,microprice,buyVolume,sellVolume,tbi,orderFlowImbalance:ofi,liquidityState:crossed?'invalid':spreadBps===null?'unknown':spreadBps>20?'thin':'normal',warnings};
}
export function simulateBookSweep(levels:BookLevel[],side:'buy'|'sell',quantity:number,feeBps=0){
 if(!Number.isFinite(quantity)||quantity<=0||feeBps<0)return {valid:false,filled:0,unfilled:Math.max(0,quantity),averagePrice:null,totalValue:0,fees:0,slippagePct:null};
 const sorted=[...levels].filter(x=>x.price>0&&x.quantity>0).sort((a,b)=>side==='buy'?a.price-b.price:b.price-a.price);
 let remaining=quantity,value=0,filled=0;
 for(const level of sorted){const take=Math.min(remaining,level.quantity);filled+=take;remaining-=take;value+=take*level.price;if(remaining<=1e-12)break;}
 const averagePrice=filled?value/filled:null,reference=sorted[0]?.price??null;
 return {valid:remaining<=1e-12,filled,unfilled:remaining,averagePrice,totalValue:value,fees:value*feeBps/10000,slippagePct:averagePrice!==null&&reference!==null?(side==='buy'?(averagePrice-reference)/reference:(reference-averagePrice)/reference)*100:null};
}
export type Evidence={agent:string;stance:'bullish'|'bearish'|'neutral'|'incomplete'|'risk';confidence:number;reason:string;hardBlock?:boolean};
export function arbitrateTradeEvidence(evidence:Evidence[],checks:{dataFresh:boolean;signalValid:boolean;economicsValid:boolean;riskApproved:boolean;exchangeHealthy:boolean}){
 const blockers:string[]=[];if(!checks.dataFresh)blockers.push('stale or unverified market data');if(!checks.signalValid)blockers.push('signal validation incomplete');if(!checks.economicsValid)blockers.push('net reward/risk economics unacceptable');if(!checks.exchangeHealthy)blockers.push('exchange or connectivity unhealthy');
 const hard=evidence.filter(x=>x.hardBlock||x.stance==='risk'||x.stance==='incomplete');if(hard.length)blockers.push(...hard.map(x=>x.agent+': '+x.reason));if(!checks.riskApproved)blockers.push('capital protection veto');
 const usable=evidence.filter(x=>x.stance==='bullish'||x.stance==='bearish'),bull=usable.filter(x=>x.stance==='bullish').reduce((a,x)=>a+x.confidence,0),bear=usable.filter(x=>x.stance==='bearish').reduce((a,x)=>a+x.confidence,0);
 const disagreement=bull>0&&bear>0;if(disagreement&&Math.abs(bull-bear)/(bull+bear)<.35)blockers.push('material agent disagreement requires additional evidence');
 const direction=bull>bear?'long':bear>bull?'short':'none';
 return {decision:blockers.length?'reject':direction==='none'?'wait':'eligible-for-risk-authorisation',direction,blockers,evidenceCount:evidence.length,disagreement,weightedBullish:bull,weightedBearish:bear,authority:'capital-protection'};
}
export type CapitalState={equity:number;peakEquity:number;dailyLossPct:number;weeklyLossPct:number;monthlyLossPct:number;openPositions:number;correlatedExposurePct:number;leverage:number;marginUtilisationPct:number;exchangeHealthy:boolean;dataFresh:boolean;accountReconciled:boolean};
export type CapitalPolicy={dailyLossPct:number;weeklyLossPct:number;monthlyLossPct:number;maxDrawdownPct:number;maxPositions:number;maxCorrelatedExposurePct:number;maxLeverage:number;maxMarginUtilisationPct:number;maxRiskPerTradePct:number};
export const defaultCapitalPolicy:CapitalPolicy={dailyLossPct:2,weeklyLossPct:5,monthlyLossPct:10,maxDrawdownPct:8,maxPositions:4,maxCorrelatedExposurePct:35,maxLeverage:2,maxMarginUtilisationPct:35,maxRiskPerTradePct:.25};
export function capitalAuthority(s:CapitalState,p=defaultCapitalPolicy){
 const values=[s.equity,s.peakEquity,s.dailyLossPct,s.weeklyLossPct,s.monthlyLossPct,s.openPositions,s.correlatedExposurePct,s.leverage,s.marginUtilisationPct];
 const valid=values.every(Number.isFinite)&&s.equity>0&&s.peakEquity>0&&Number.isInteger(s.openPositions)&&s.openPositions>=0&&s.dailyLossPct>=0&&s.weeklyLossPct>=0&&s.monthlyLossPct>=0&&s.correlatedExposurePct>=0&&s.leverage>=0&&s.marginUtilisationPct>=0;
 const drawdown=valid?Math.max(0,(s.peakEquity-s.equity)/s.peakEquity*100):100,reasons:string[]=[];
 if(!valid)reasons.push('invalid or unavailable account risk metrics');
 if(s.dailyLossPct>=p.dailyLossPct)reasons.push('daily loss limit');if(s.weeklyLossPct>=p.weeklyLossPct)reasons.push('weekly loss limit');if(s.monthlyLossPct>=p.monthlyLossPct)reasons.push('monthly loss limit');if(drawdown>=p.maxDrawdownPct)reasons.push('maximum drawdown');if(s.openPositions>=p.maxPositions)reasons.push('open position cap');if(s.correlatedExposurePct>p.maxCorrelatedExposurePct)reasons.push('correlated exposure cap');if(s.leverage>p.maxLeverage)reasons.push('leverage cap');if(s.marginUtilisationPct>p.maxMarginUtilisationPct)reasons.push('margin utilisation cap');if(!s.exchangeHealthy)reasons.push('exchange unhealthy');if(!s.dataFresh)reasons.push('market data stale');if(!s.accountReconciled)reasons.push('account state not reconciled');
 const throttle=reasons.length?0:Math.max(.1,1-drawdown/p.maxDrawdownPct);
 return {allowNewEntries:reasons.length===0,reasons,drawdownPct:drawdown,riskThrottle:throttle,finalVetoAuthority:true,killSwitch:reasons.some(x=>['invalid or unavailable account risk metrics','exchange unhealthy','market data stale','account state not reconciled','maximum drawdown'].includes(x))};
}
export function allocateCapital<T extends {id:string;score:number;eligible:boolean;maxAllocationPct:number}>(candidates:T[],totalCapital:number){
 const qualified=candidates.filter(x=>x.eligible&&Number.isFinite(x.score)&&x.score>0),weight=sum(qualified.map(x=>x.score));
 return candidates.map(x=>({id:x.id,allocation:qualified.includes(x)&&weight>0?Math.min(totalCapital*x.score/weight,totalCapital*x.maxAllocationPct/100):0,eligible:x.eligible&&qualified.includes(x)}));
}
export type BotGuardInput={spreadBps:number;maxSpreadBps:number;grossRewardRisk:number;estimatedCostRisk:number;extensionPct:number;maxExtensionPct:number;cooldownActive:boolean;duplicatePosition:boolean;dailyLossLimitHit:boolean;exchangeHealthy:boolean;dataFresh:boolean;latencyMs:number;maxLatencyMs:number;volatilityShock:boolean};
export function scalpingGuard(x:BotGuardInput){const reasons:string[]=[];if(x.spreadBps>x.maxSpreadBps)reasons.push('spread too wide');if(x.grossRewardRisk-x.estimatedCostRisk<=1)reasons.push('net reward/risk at or below 1');if(x.extensionPct>x.maxExtensionPct)reasons.push('price extension too large');if(x.cooldownActive)reasons.push('cooldown active');if(x.duplicatePosition)reasons.push('duplicate entry');if(x.dailyLossLimitHit)reasons.push('daily loss limit reached');if(!x.exchangeHealthy)reasons.push('exchange unstable');if(!x.dataFresh)reasons.push('stale data');if(x.latencyMs>x.maxLatencyMs)reasons.push('execution latency too high');if(x.volatilityShock)reasons.push('volatility shock');return {allowed:reasons.length===0,reasons};}
export type GraduationEvidence={unitTests:boolean;backtestTrades:number;backtestNetExpectancy:number;oosTrades:number;oosNetExpectancy:number;walkForward:boolean;stress:boolean;paperTrades:number;paperNetExpectancy:number;paperMaxDrawdownPct:number;stable:boolean;liveTestEvidence:boolean;explicitApproval:boolean};
export function deploymentQualification(e:GraduationEvidence){
 const failed:string[]=[];if(!e.unitTests)failed.push('unit/regression tests');if(e.backtestTrades<100||e.backtestNetExpectancy<=0)failed.push('historical backtest');if(e.oosTrades<50||e.oosNetExpectancy<=0)failed.push('out-of-sample validation');if(!e.walkForward)failed.push('walk-forward validation');if(!e.stress)failed.push('stress testing');if(e.paperTrades<100||e.paperNetExpectancy<=0||e.paperMaxDrawdownPct>5)failed.push('paper trading');if(!e.stable)failed.push('performance stability');
 if(failed.length)return {stage:'development-or-testing',eligible:false,failed};if(!e.explicitApproval)return {stage:'paper-qualified',eligible:false,failed:['explicit operator approval required']};if(!e.liveTestEvidence)return {stage:'restricted-live-test-pending',eligible:false,failed:['controlled live-test evidence required']};return {stage:'restricted-live-review',eligible:true,failed:['restricted scope and risk limits must be approved; no automatic production promotion']};
}
export type TradeMemoryRecord={id:string;timestamp:number;exchange:string;market:string;symbol:string;strategy:string;agent:string;regime:string;signal:string;confidence:number;entry:number;stop:number;target:number;quantity:number;leverage:number;entryTime:number;exitTime?:number;fees:number;funding:number;slippage:number;grossPnl?:number;netPnl?:number;mfe?:number;mae?:number;exitReason?:string;executionQuality?:number;lessons?:string[];strategyVersion:string};
export function validateTradeMemory(r:TradeMemoryRecord){const errors:string[]=[];for(const k of ['id','exchange','market','symbol','strategy','agent','regime','strategyVersion'] as const)if(!r[k])errors.push(k+' missing');for(const k of ['timestamp','confidence','entry','stop','target','quantity','leverage','entryTime','fees','funding','slippage'] as const)if(!Number.isFinite(r[k]))errors.push(k+' invalid');if(r.quantity<=0||r.entry<=0||r.stop<=0||r.target<=0)errors.push('non-positive trade parameters');return {valid:errors.length===0,errors};}
export function canResumeTrading(s:{accountReconciled:boolean;marketDataFresh:boolean;exchangeHealthy:boolean;incidentAcknowledged:boolean;operatorApproved:boolean}){const reasons:string[]=[];if(!s.accountReconciled)reasons.push('account reconciliation incomplete');if(!s.marketDataFresh)reasons.push('market data not fresh');if(!s.exchangeHealthy)reasons.push('exchange unhealthy');if(!s.incidentAcknowledged)reasons.push('incident not acknowledged');if(!s.operatorApproved)reasons.push('operator approval required');return {canResume:reasons.length===0,reasons};}
export const exchangeMarketSupport={bitget:{spot:true,margin:true,usdtM:true,coinM:true,usdcM:true},adapterStatus:'not-connected' as const,liveExecutionEnabled:false};

export type QueueEvent={side:'bid'|'ask';kind:'add'|'cancel'|'execute';quantity:number;timestamp:number};
export function calculateOrderFlowImbalance(events:QueueEvent[]){let bid=0,ask=0;for(const e of events){if(!Number.isFinite(e.quantity)||e.quantity<0)continue;const signed=e.kind==='add'?e.quantity:-e.quantity;if(e.side==='bid')bid+=signed;else ask+=signed;}const denominator=Math.abs(bid)+Math.abs(ask);return {bidNetChange:bid,askNetChange:ask,ofi:denominator? (bid-ask)/denominator:0,events:events.length};}
export type PerformanceSample={netPnl:number;grossProfit:number;grossLoss:number;maxDrawdownPct:number;trades:number;expectancy:number;sharpe?:number;sortino?:number;executionSlippageBps:number;signalCalibrationError:number;regimeStable:boolean;dataReliable:boolean};
export function classifyPerformance(x:PerformanceSample){const profitFactor=x.grossLoss>0?x.grossProfit/x.grossLoss:x.grossProfit>0?Infinity:0;const failures:string[]=[];if(x.trades<100)failures.push('sample too small');if(x.netPnl<=0||x.expectancy<=0)failures.push('net expectancy not positive');if(profitFactor<1.2)failures.push('profit factor below threshold');if(x.maxDrawdownPct>12)failures.push('drawdown too high');if(x.executionSlippageBps>15)failures.push('execution slippage too high');if(x.signalCalibrationError>.2)failures.push('confidence calibration error');if(!x.regimeStable)failures.push('regime instability');if(!x.dataReliable)failures.push('data reliability failure');const status=failures.length?'probation-or-restricted':x.trades>=300&&x.maxDrawdownPct<8&&profitFactor>=1.5?'qualified-review':'testing';return {status,profitFactor,failures,liveEligible:false as const};}
export function agentTrustScore(input:{successfulTasks:number;failedTasks:number;policyViolations:number;dataErrors:number;decisionReversals:number}){const total=input.successfulTasks+input.failedTasks;const reliability=total?input.successfulTasks/total:0;return Math.max(0,Math.min(100,reliability*100-input.policyViolations*15-input.dataErrors*5-input.decisionReversals*2));}

/** The single decision boundary strategies, replications and bots must call before any order request. */
export function authorizeTrade(input:{evidence:Evidence[];checks:{dataFresh:boolean;signalValid:boolean;economicsValid:boolean;exchangeHealthy:boolean};capital:CapitalState;proposedRiskPct:number;policy?:CapitalPolicy;scalping?:BotGuardInput}){
 const policy=input.policy??defaultCapitalPolicy,baseRisk=capitalAuthority(input.capital,policy),riskReasons=[...baseRisk.reasons];
 if(!Number.isFinite(input.proposedRiskPct)||input.proposedRiskPct<=0)riskReasons.push('proposed per-trade risk is missing or invalid');else if(input.proposedRiskPct>policy.maxRiskPerTradePct)riskReasons.push('proposed per-trade risk exceeds capital policy');
 const risk={...baseRisk,allowNewEntries:riskReasons.length===0,reasons:riskReasons,riskThrottle:riskReasons.length?0:baseRisk.riskThrottle};
 const arbitration=arbitrateTradeEvidence(input.evidence,{...input.checks,riskApproved:risk.allowNewEntries,exchangeHealthy:input.checks.exchangeHealthy&&input.capital.exchangeHealthy,dataFresh:input.checks.dataFresh&&input.capital.dataFresh});
 const scalp=input.scalping?scalpingGuard(input.scalping):{allowed:true,reasons:[] as string[]};
 const approved=arbitration.decision==='eligible-for-risk-authorisation'&&risk.allowNewEntries&&scalp.allowed;
 return {approved,decision:approved?'paper-order-eligible':'rejected',mode:'paper' as const,liveExecutionEnabled:false as const,risk,arbitration,scalping:scalp,finalAuthority:'capital-protection'};
}
export function authorizeOrder(input:{signalApproved:boolean;capital:CapitalState;proposedRiskPct:number;market:'spot'|'margin'|'usdt-m'|'coin-m'|'usdc-m';quantity:number;price?:number;minQuantity:number;quantityStep:number;priceTick?:number;liveRequested?:boolean;policy?:CapitalPolicy}){
 const policy=input.policy??defaultCapitalPolicy,risk=capitalAuthority(input.capital,policy),errors=[...risk.reasons];
 if(!Number.isFinite(input.proposedRiskPct)||input.proposedRiskPct<=0)errors.push('proposed per-trade risk is missing or invalid');else if(input.proposedRiskPct>policy.maxRiskPerTradePct)errors.push('proposed per-trade risk exceeds capital policy');
 if(!input.signalApproved)errors.push('signal not approved');if(input.liveRequested)errors.push('live execution disabled');
 if(!Number.isFinite(input.minQuantity)||input.minQuantity<0||!Number.isFinite(input.quantity)||input.quantity<input.minQuantity)errors.push('quantity below minimum or invalid');
 if(!Number.isFinite(input.quantityStep)||input.quantityStep<=0||Math.abs(input.quantity/input.quantityStep-Math.round(input.quantity/input.quantityStep))>1e-8)errors.push('quantity precision invalid');
 if(input.price!==undefined&&(!Number.isFinite(input.price)||input.price<=0))errors.push('price invalid');
 if(input.priceTick!==undefined&&(!Number.isFinite(input.priceTick)||input.priceTick<=0||input.price===undefined||Math.abs(input.price/input.priceTick-Math.round(input.price/input.priceTick))>1e-8))errors.push('price precision invalid');
 return {approved:errors.length===0,errors,market:input.market,quantity:input.quantity,mode:'paper' as const,liveExecutionEnabled:false as const,capitalVeto:!risk.allowNewEntries||errors.some(x=>x.includes('per-trade risk'))};
}
