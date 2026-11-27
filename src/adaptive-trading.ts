export type TradingDivision = 'scalping' | 'day-trading';
export type AdaptiveMode = 'SCALPING' | 'DAY_TRADING' | 'COMBINATION' | 'NEITHER';
export type Direction = 'long' | 'short' | 'neutral';
export interface MarketEvidence {
  symbol:string; assetClass:string; price:number; direction:Direction; scalpingDirection?:Direction; dayTradingDirection?:Direction; scalpingOrderBookImbalance?:number; dayTradingOrderBookImbalance?:number; dayTradingTrendAlignment?:number; observedAt:number;
  spreadBps:number; estimatedRoundTripCostBps:number; volatilityPct:number; volumeRatio:number;
  trendAlignment:number; orderBookImbalance:number; liquidityUsd:number; atrPct:number;
  dataAgeMs:number; scalpingDataAgeMs?:number; dayTradingDataAgeMs?:number; sessionEligible:boolean; scalpingAtrPct?:number; dayTradingAtrPct?:number; scalpingVolumeRatio?:number; dayTradingVolumeRatio?:number; scalpingVolatilityPct?:number; dayTradingVolatilityPct?:number; scalpingFvg?:boolean; dayTradingFvg?:boolean; scalpingLiquiditySweep?:boolean; dayTradingLiquiditySweep?:boolean; scalpingMarketStructureShift?:boolean; dayTradingMarketStructureShift?:boolean; scalpingVwapAligned?:boolean; dayTradingVwapAligned?:boolean; fvg:boolean; liquiditySweep:boolean;
  marketStructureShift:boolean; vwapAligned:boolean; fundingExtreme?:boolean;
}
export interface DivisionPolicy {
  allocationUsd:number; maxRiskPerTradePct:number; maxDailyLossPct:number; maxOpenPositions:number;
  minScore:number; maxSpreadBps:number; maxRoundTripCostBps:number; minLiquidityUsd:number;
}
export interface DivisionAssessment {
  division:TradingDivision; score:number; eligible:boolean; direction:Direction;
  strategy:string; reasons:string[]; vetoes:string[]; riskBudgetUsd:number;
}
export interface AdaptiveDecision {
  mode:AdaptiveMode; selected:DivisionAssessment[]; scalping:DivisionAssessment; dayTrading:DivisionAssessment;
  symbol:string; observedAt:number; standDown:boolean; rationale:string[];
  capital:{totalUsd:number;scalpingUsd:number;dayTradingUsd:number;unallocatedUsd:number};
  kpi:{aspirationalReturnPct:98;guaranteed:false;priority:'capital-preservation';maxDailyLossPct:number};
  liveTradingEnabled:false;
}
export const DEFAULT_DIVISION_POLICIES:Record<TradingDivision,DivisionPolicy>={
  scalping:{allocationUsd:2,maxRiskPerTradePct:0.35,maxDailyLossPct:1.5,maxOpenPositions:2,minScore:72,maxSpreadBps:8,maxRoundTripCostBps:32,minLiquidityUsd:25000},
  'day-trading':{allocationUsd:3,maxRiskPerTradePct:0.5,maxDailyLossPct:2,maxOpenPositions:3,minScore:70,maxSpreadBps:18,maxRoundTripCostBps:28,minLiquidityUsd:10000}
};
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
function validate(e:MarketEvidence){if(!e||typeof e.symbol!=='string'||!e.symbol.trim())throw new Error('A market symbol is required');for(const k of ['price','observedAt','spreadBps','estimatedRoundTripCostBps','volatilityPct','volumeRatio','trendAlignment','orderBookImbalance','liquidityUsd','atrPct','dataAgeMs'] as const)if(!Number.isFinite(e[k]))throw new Error('Invalid market evidence: '+k);if(e.price<=0||e.spreadBps<0||e.estimatedRoundTripCostBps<0||e.liquidityUsd<0||e.dataAgeMs<0)throw new Error('Market evidence contains impossible values');if(!['long','short','neutral'].includes(e.direction)||!['long','short','neutral'].includes(e.scalpingDirection??e.direction)||!['long','short','neutral'].includes(e.dayTradingDirection??e.direction))throw new Error('Invalid market direction');for(const k of ['scalpingDataAgeMs','dayTradingDataAgeMs','orderBookImbalance','trendAlignment','scalpingOrderBookImbalance','dayTradingOrderBookImbalance','dayTradingTrendAlignment'] as const){const v=e[k];if(v!==undefined&&(!Number.isFinite(v)||(k.includes('DataAge')?v<0:v < -1||v > 1)))throw new Error('Invalid directional evidence: '+k);}}
function assess(e:MarketEvidence,division:TradingDivision,policy:DivisionPolicy):DivisionAssessment{
 const reasons:string[]=[],vetoes:string[]=[];
 const age=division==='scalping'?(e.scalpingDataAgeMs??e.dataAgeMs):(e.dayTradingDataAgeMs??e.dataAgeMs);
 const fresh=age<=(division==='scalping'?5000:60000);
 if(!fresh)vetoes.push('Market data is stale for this trading horizon');
 const direction=division==='scalping'?(e.scalpingDirection??e.direction):(e.dayTradingDirection??e.direction);
 const imbalance=division==='scalping'?(e.scalpingOrderBookImbalance??e.orderBookImbalance):(e.dayTradingOrderBookImbalance??e.orderBookImbalance);
 const alignedTrend=division==='day-trading'?(e.dayTradingTrendAlignment??e.trendAlignment):e.trendAlignment;
 const volumeRatio=division==='scalping'?(e.scalpingVolumeRatio??e.volumeRatio):(e.dayTradingVolumeRatio??e.volumeRatio);
 const volatilityPct=division==='scalping'?(e.scalpingVolatilityPct??e.volatilityPct):(e.dayTradingVolatilityPct??e.volatilityPct);
 const fvg=division==='scalping'?(e.scalpingFvg??e.fvg):(e.dayTradingFvg??e.fvg);
 const liquiditySweep=division==='scalping'?(e.scalpingLiquiditySweep??e.liquiditySweep):(e.dayTradingLiquiditySweep??e.liquiditySweep);
 const structureShift=division==='scalping'?(e.scalpingMarketStructureShift??e.marketStructureShift):(e.dayTradingMarketStructureShift??e.marketStructureShift);
 const vwapAligned=division==='scalping'?(e.scalpingVwapAligned??e.vwapAligned):(e.dayTradingVwapAligned??e.vwapAligned);
 if(direction==='neutral')vetoes.push('No directional edge');
 if(e.spreadBps>policy.maxSpreadBps)vetoes.push('Spread exceeds division limit');
 if(e.estimatedRoundTripCostBps>policy.maxRoundTripCostBps)vetoes.push('Estimated round-trip costs exceed division limit');
 if(e.liquidityUsd<policy.minLiquidityUsd)vetoes.push('Insufficient verified liquidity');
 if(volatilityPct<=0||volatilityPct>(division==='scalping'?2.5:8))vetoes.push('Volatility outside division operating envelope');
 if(division==='day-trading'&&!e.sessionEligible)vetoes.push('Outside configured day-trading session');
 let score=0,strategy='NO_TRADE';
 if(division==='scalping'){
  const micro=clamp((imbalance*(direction==='short'?-1:1)+1)*50);
  const volume=clamp((volumeRatio-0.7)*55);
  const volatility=clamp(100-Math.abs(volatilityPct-0.65)*65);
  const costs=clamp(100-e.estimatedRoundTripCostBps*5);
  const structure=(liquiditySweep?22:0)+(fvg?12:0)+(vwapAligned?10:0);
  score=clamp(micro*.24+volume*.18+volatility*.18+costs*.22+clamp(structure)*.18);
  if(liquiditySweep&&structureShift)strategy='LIQUIDITY_SWEEP_RECLAIM';
  else if(fvg&&vwapAligned)strategy='FVG_VWAP_RETEST';
  else if(volumeRatio>=1.5&&micro>=55)strategy='ORDER_FLOW_MOMENTUM';
  else if(volatilityPct<0.8)strategy='MICRO_MEAN_REVERSION';
  reasons.push('Microstructure, spread, volume and short-horizon volatility weighted');
 }else{
  const trend=clamp((alignedTrend*(direction==='short'?-1:1)+1)*50),structure=(structureShift?25:0)+(fvg?18:0)+(liquiditySweep?15:0)+(vwapAligned?12:0);
  const volume=clamp((volumeRatio-0.6)*45),volatility=clamp(100-Math.abs(volatilityPct-2)*20);
  score=clamp(trend*.32+clamp(structure)*.28+volume*.16+volatility*.14+clamp((imbalance*(direction==='short'?-1:1)+1)*50)*.10);
  if(structureShift&&fvg&&liquiditySweep)strategy='SMC_MSS_SWEEP_FVG';
  else if(structureShift&&vwapAligned)strategy='STRUCTURE_VWAP_CONTINUATION';
  else if(fvg)strategy='FVG_RETRACEMENT';
  else if(trend>=65)strategy='MTF_TREND_PULLBACK';
  reasons.push('Multi-timeframe trend, SMC structure, FVG, liquidity and session evidence weighted');
 }
 if(e.fundingExtreme)reasons.push('Extreme funding flagged for independent derivatives-risk review');
 if(score<policy.minScore)vetoes.push('Evidence score below division entry threshold');
 if(!vetoes.length)reasons.push('All division-specific market quality gates passed');
 return {division,score:Math.round(score*100)/100,eligible:vetoes.length===0,direction,strategy:strategy,reasons,vetoes,riskBudgetUsd:policy.allocationUsd*policy.maxRiskPerTradePct/100};
}

export function evaluateAdaptiveTrading(e:MarketEvidence,options?:{totalCapitalUsd?:number;policies?:Partial<Record<TradingDivision,Partial<DivisionPolicy>>>}):AdaptiveDecision{
 validate(e);
 const total=Math.max(0,Number.isFinite(options?.totalCapitalUsd)?Number(options?.totalCapitalUsd):5);
 const policies={scalping:{...DEFAULT_DIVISION_POLICIES.scalping,...options?.policies?.scalping},'day-trading':{...DEFAULT_DIVISION_POLICIES['day-trading'],...options?.policies?.['day-trading']}};
 const sum=policies.scalping.allocationUsd+policies['day-trading'].allocationUsd;
 if(sum>total&&sum>0){const factor=total/sum;policies.scalping.allocationUsd*=factor;policies['day-trading'].allocationUsd*=factor;}
 const scalp=assess(e,'scalping',policies.scalping),day=assess(e,'day-trading',policies['day-trading']);
 const eligible=[scalp,day].filter(x=>x.eligible).sort((a,b)=>b.score-a.score);
 let selected:DivisionAssessment[]=[],mode:AdaptiveMode='NEITHER',rationale:string[]=[];
 if(eligible.length===2&&eligible[0].direction!==eligible[1].direction){rationale.push('Divisions produced opposing directional signals; collision arbiter blocks both');}
 else if(eligible.length===2&&eligible.every(x=>x.score>=80)){selected=eligible;mode='COMBINATION';rationale.push('Both divisions independently cleared their thresholds with aligned direction; allocations and risk remain separate');}
 else if(eligible.length){selected=[eligible[0]];mode=eligible[0].division==='scalping'?'SCALPING':'DAY_TRADING';rationale.push('Highest-scoring eligible division selected; the other division retains its own assessment and capital');}
 else rationale.push('No division passed every market-quality, freshness, cost and evidence gate; stand down');
 if(!scalp.eligible)rationale.push(...scalp.vetoes.map(x=>'Scalping: '+x));
 if(!day.eligible)rationale.push(...day.vetoes.map(x=>'Day trading: '+x));
 const used=selected.reduce((n,x)=>n+(x.division==='scalping'?policies.scalping.allocationUsd:policies['day-trading'].allocationUsd),0);
 return {mode,selected,scalping:scalp,dayTrading:day,symbol:e.symbol,observedAt:e.observedAt,standDown:!selected.length,rationale,capital:{totalUsd:total,scalpingUsd:policies.scalping.allocationUsd,dayTradingUsd:policies['day-trading'].allocationUsd,unallocatedUsd:Math.max(0,total-used)},kpi:{aspirationalReturnPct:98,guaranteed:false,priority:'capital-preservation',maxDailyLossPct:Math.max(policies.scalping.maxDailyLossPct,policies['day-trading'].maxDailyLossPct)},liveTradingEnabled:false};
}
export const SCALPING_STRATEGIES=['LIQUIDITY_SWEEP_RECLAIM','FVG_VWAP_RETEST','ORDER_FLOW_MOMENTUM','MICRO_MEAN_REVERSION'];
export const DAY_TRADING_STRATEGIES=['SMC_MSS_SWEEP_FVG','STRUCTURE_VWAP_CONTINUATION','FVG_RETRACEMENT','MTF_TREND_PULLBACK'];
export function classifyDivisionTrade(strategyId:string):TradingDivision|null{if(SCALPING_STRATEGIES.includes(strategyId))return 'scalping';if(DAY_TRADING_STRATEGIES.includes(strategyId))return 'day-trading';return null;}
