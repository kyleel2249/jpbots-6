import type {Agent,Signal} from './types';
export type RiskConfig={paperOnly:boolean;maxRiskPct:number;dailyLossLimitPct:number;maxOpenPositions:number;allowWeekends:boolean};
export const defaultRisk:RiskConfig={paperOnly:true,maxRiskPct:0.25,dailyLossLimitPct:2,maxOpenPositions:4,allowWeekends:false};
/** Preliminary signal-quality filter only; never authorises an order. Final decisions must pass central capital and order authorization. */
export function validateSignal(signal:Signal,agent:Agent,risk:RiskConfig,openPositions:number,dailyLossPct:number){
 const reasons:string[]=[];
 if(!Number.isFinite(signal.confidence)||signal.confidence<72||signal.confidence>100)reasons.push('Confidence missing or outside 72–100% gate');
 if(!Number.isFinite(agent.risk)||agent.risk<0||!Number.isFinite(openPositions)||!Number.isFinite(dailyLossPct)||openPositions<0||dailyLossPct<0)reasons.push('Invalid signal or account risk metrics');
 if(agent.status==='PAUSED'||agent.status==='COOLDOWN')reasons.push('Agent is not eligible');
 if(agent.risk>risk.maxRiskPct)reasons.push('Agent risk exceeds portfolio cap');
 if(openPositions>=risk.maxOpenPositions)reasons.push('Open-position limit reached');
 if(dailyLossPct>=risk.dailyLossLimitPct)reasons.push('Daily loss circuit breaker active');
 return {approved:reasons.length===0,reasons};
}
export function estimatePositionSize(equity:number,entry:number,stop:number,riskPct:number){
 if(![equity,entry,stop,riskPct].every(Number.isFinite)||equity<=0||entry<=0||stop<=0||entry===stop||riskPct<=0||riskPct>100)return 0;
 const riskCash=equity*riskPct/100;return riskCash/Math.abs(entry-stop);
}
export function isWeekday(date=new Date()){const d=date.getUTCDay();return d>=1&&d<=5;}
