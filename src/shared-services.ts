/** Shared platform services. Pure deterministic functions; adapters/storage/workers are separate infrastructure concerns. */
export type BookLevel={price:number;quantity:number};
export type TradePrint={price:number;quantity:number;aggressor:'buy'|'sell'|'unknown';timestamp:number};
export type OrderBookSnapshot={symbol:string;timestamp:number;mid:number;bids:BookLevel[];asks:BookLevel[];trades?:TradePrint[];previous?:{bids:BookLevel[];asks:BookLevel[]}};
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const safeRatio=(n:number,d:number)=>d>0?n/d:0;
export function analyseOrderBook(b:OrderBookSnapshot){
 const bids=[...b.bids].filter(x=>x.price>0&&x.quantity>0).sort((a,b)=>b.price-a.price),asks=[...b.asks].filter(x=>x.price>0&&x.quantity>0).sort((a,b)=>a.price-b.price);
 const bid=sum(bids.map(x=>x.quantity)),ask=sum(asks.map(x=>x.quantity)),total=bid+ask,obi=safeRatio(bid-ask,total);
 const weighted=(levels:BookLevel[],side:'bid'|'ask')=>sum(levels.map(x=>x.quantity/(1+Math.abs(x.price-b.mid)/b.mid*100)));
 const wb=weighted(bids,'bid'),wa=weighted(asks,'ask'),wobi=safeRatio(wb-wa,wb+wa);
 const bands=[.0005,.001,.0025,.005,.01].map(distance=>({distancePct:distance*100,bidDepth:sum(bids.filter(x=>x.price>=b.mid*(1-distance)).map(x=>x.quantity)),askDepth:sum(asks.filter(x=>x.price<=b.mid*(1+distance)).map(x=>x.quantity))}));
 const bestBid=bids[0],bestAsk=asks[0],spreadBps=bestBid&&bestAsk?safeRatio(bestAsk.price-bestBid.price,b.mid)*10000:null;
 const microprice=bestBid&&bestAsk&&bestBid.quantity+bestAsk.quantity>0?(bestAsk.price*bestBid.quantity+bestBid.price*bestAsk.quantity)/(bestBid.quantity+bestAsk.quantity):null;
 const buyVolume=sum((b.trades??[]).filter(t=>t.aggressor==='buy').map(t=>t.quantity)),sellVolume=sum((b.trades??[]).filter(t=>t.aggressor==='sell').map(t=>t.quantity)),tbi=safeRatio(buyVolume-sellVolume,buyVolume+sellVolume);
 let ofi:number|null=null;
 if(b.previous){const oldBid=sum(b.previous.bids.map(x=>x.quantity)),oldAsk=sum(b.previous.asks.map(x=>x.quantity));ofi=safeRatio((bid-oldBid)-(ask-oldAsk),Math.abs(bid-oldBid)+Math.abs(ask-oldAsk));}
 return {symbol:b.symbol,timestamp:b.timestamp,bestBid:bestBid??null,bestAsk:bestAsk??null,spreadBps,obi,wobi,bands,microprice,buyVolume,sellVolume,tbi,orderFlowImbalance:ofi,liquidityState:spreadBps===null?'unknown':spreadBps>20?'thin':'normal',warnings:[...(spreadBps!==null&&spreadBps>20?['Wide spread']:[]),...(bids.length===0||asks.length===0?['Incomplete book side']:[])]};
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
 const direction=bull>bear?'long':bear>bull?'short':'none';
 return {decision:blockers.length?'reject':direction==='none'?'wait':'eligible-for-risk-authorisation',direction,blockers,evidenceCount:evidence.length,disagreement:bull>0&&bear>0,weightedBullish:bull,weightedBearish:bear,authority:'capital-protection'};
}
export type CapitalState={equity:number;peakEquity:number;dailyLossPct:number;weeklyLossPct:number;monthlyLossPct:number;openPositions:number;correlatedExposurePct:number;leverage:number;marginUtilisationPct:number;exchangeHealthy:boolean;dataFresh:boolean;accountReconciled:boolean};
export type CapitalPolicy={dailyLossPct:number;weeklyLossPct:number;monthlyLossPct:number;maxDrawdownPct:number;maxPositions:number;maxCorrelatedExposurePct:number;maxLeverage:number;maxMarginUtilisationPct:number;maxRiskPerTradePct:number};
export const defaultCapitalPolicy:CapitalPolicy={dailyLossPct:2,weeklyLossPct:5,monthlyLossPct:10,maxDrawdownPct:8,maxPositions:4,maxCorrelatedExposurePct:35,maxLeverage:2,maxMarginUtilisationPct:35,maxRiskPerTradePct:.25};
export function capitalAuthority(s:CapitalState,p=defaultCapitalPolicy){
 const drawdown=s.peakEquity>0?Math.max(0,(s.peakEquity-s.equity)/s.peakEquity*100):100,reasons:string[]=[];
 if(s.dailyLossPct>=p.dailyLossPct)reasons.push('daily loss limit');if(s.weeklyLossPct>=p.weeklyLossPct)reasons.push('weekly loss limit');if(s.monthlyLossPct>=p.monthlyLossPct)reasons.push('monthly loss limit');if(drawdown>=p.maxDrawdownPct)reasons.push('maximum drawdown');if(s.openPositions>=p.maxPositions)reasons.push('open position cap');if(s.correlatedExposurePct>p.maxCorrelatedExposurePct)reasons.push('correlated exposure cap');if(s.leverage>p.maxLeverage)reasons.push('leverage cap');if(s.marginUtilisationPct>p.maxMarginUtilisationPct)reasons.push('margin utilisation cap');if(!s.exchangeHealthy)reasons.push('exchange unhealthy');if(!s.dataFresh)reasons.push('market data stale');if(!s.accountReconciled)reasons.push('account state not reconciled');
 const throttle=reasons.length?0:Math.max(.1,1-drawdown/p.maxDrawdownPct);
 return {allowNewEntries:reasons.length===0,reasons,drawdownPct:drawdown,riskThrottle:throttle,finalVetoAuthority:true,killSwitch:reasons.some(x=>['exchange unhealthy','market data stale','account state not reconciled','maximum drawdown'].includes(x))};
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
