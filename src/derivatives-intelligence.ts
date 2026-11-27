export type DerivativesSnapshot={observedAt:number;fundingRate:number;nextFundingTime:number;markPrice:number;indexPrice:number;openInterest:number;openInterestTime:number};
export type DerivativesAssessment={status:'available'|'unavailable';funding:{rate:number;rateBps:number;nextFundingTime:number;condition:'crowded-long-risk'|'crowded-short-risk'|'neutral'}|null;basis:{markVsSpotBps:number;markPrice:number;indexPrice:number}|null;openInterest:{contracts:number;observedAt:number}|null;warnings:string[];limitations:string[]};
const finite=(x:number)=>Number.isFinite(x);
export function assessDerivatives(snapshot:DerivativesSnapshot|null,spotPrice:number,observedAt:number):DerivativesAssessment{
 const limitations=['A single open-interest observation cannot establish whether positioning is increasing or decreasing.','Funding is a periodic derivatives-market cost indicator, not a directional signal by itself.','This feed does not include liquidation history, account-level long/short positioning or historical open-interest changes.','Derivatives observations are supplemental and never authorise a trade.'];
 if(!snapshot)return {status:'unavailable',funding:null,basis:null,openInterest:null,warnings:['Public derivatives data is unavailable; no derivatives conclusion is inferred.'],limitations};
 const valid=finite(snapshot.observedAt)&&snapshot.observedAt>0&&finite(snapshot.fundingRate)&&finite(snapshot.nextFundingTime)&&finite(snapshot.markPrice)&&snapshot.markPrice>0&&finite(snapshot.indexPrice)&&snapshot.indexPrice>0&&finite(snapshot.openInterest)&&snapshot.openInterest>=0&&finite(snapshot.openInterestTime)&&snapshot.openInterestTime>0&&finite(spotPrice)&&spotPrice>0&&finite(observedAt)&&observedAt>0;
 if(!valid)return {status:'unavailable',funding:null,basis:null,openInterest:null,warnings:['Derivatives provider returned malformed or incomplete data.'],limitations};
 const fundingCondition=snapshot.fundingRate>=0.0005?'crowded-long-risk':snapshot.fundingRate<=-0.0005?'crowded-short-risk':'neutral';
 const markVsSpotBps=(snapshot.markPrice/spotPrice-1)*10000;
 const warnings:string[]=[];
 if(fundingCondition!=='neutral')warnings.push('Funding is unusually positive or negative; treat the corresponding side as carrying elevated crowding/carry risk, not as a reversal prediction.');
 if(Math.abs(markVsSpotBps)>20)warnings.push('Perpetual mark price materially differs from the spot reference; check basis and feed synchronisation.');
 if(observedAt-snapshot.observedAt>60_000||observedAt-snapshot.observedAt< -5_000)warnings.push('Derivatives premium-index snapshot is stale or future-dated.');
 if(observedAt-snapshot.openInterestTime>120_000||observedAt-snapshot.openInterestTime< -5_000)warnings.push('Open-interest observation is stale or future-dated.');
 return {status:'available',funding:{rate:snapshot.fundingRate,rateBps:snapshot.fundingRate*10000,nextFundingTime:snapshot.nextFundingTime,condition:fundingCondition},basis:{markVsSpotBps,markPrice:snapshot.markPrice,indexPrice:snapshot.indexPrice},openInterest:{contracts:snapshot.openInterest,observedAt:snapshot.openInterestTime},warnings,limitations};
}
