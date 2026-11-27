import { analyseAmdSession, buildAmdPdArrays, DEFAULT_AMD_TIMEZONE, type AmdAssessment, type AmdDirection } from './amd-session-strategy';
import type { StrategyCandle } from './institutional-strategy';

export type AmdValidationConfig = {
  timezone:string; sweepSensitivityBps:number; minArrayStrength:number;
  rewardRisk:number; feeBps:number; slippageBps:number; initialEquity:number;
  riskPct:number; maxHoldingCandles:number;
};
export const DEFAULT_AMD_VALIDATION_CONFIG:AmdValidationConfig={
  timezone:DEFAULT_AMD_TIMEZONE,sweepSensitivityBps:0,minArrayStrength:65,
  rewardRisk:2,feeBps:10,slippageBps:5,initialEquity:10000,riskPct:0.25,maxHoldingCandles:36
};
export type AmdReplayTrade={
  sessionDate:string;side:'long'|'short';signalTime:number;entryTime:number;exitTime:number;
  entry:number;stop:number;target:number;exit:number;exitReason:'stop'|'target'|'session-end';
  initialRisk:number;grossPnl:number;costs:number;netPnl:number;netR:number;
  mfe:number;mae:number;mfeR:number;maeR:number;barsHeld:number;qualification:AmdAssessment;
};
export type AmdMetrics={
  trades:number;wins:number;losses:number;winRatePct:number;netPnl:number;returnPct:number;
  expectancyR:number;profitFactor:number|null;maxDrawdownPct:number;averageR:number;medianR:number;maxConsecutiveWins:number;maxConsecutiveLosses:number;recoveryFactor:number|null;
  averageMfeR:number;averageMaeR:number;averageMfePct:number;averageMaePct:number;
  averageBarsHeld:number;longTrades:number;shortTrades:number;
};
export type AmdReplayResult={
  valid:boolean;errors:string[];config:AmdValidationConfig;sourceCandles:number;
  sessions:number;qualifiedSignals:number;rejectedSignals:number;trades:AmdReplayTrade[];
  metrics:AmdMetrics|null;equityCurve:{time:number;equity:number;drawdownPct:number}[];uncertainty:{iterations:number;expectancyR95:[number,number]|null;winRatePct95:[number,number]|null;sampleAdequate:boolean}|null;
  regimeBreakdown:{regime:'bullish'|'bearish'|'ranging';sessions:number;trades:number;winRatePct:number;expectancyR:number;netPnl:number}[];
};
const finite=(n:number)=>Number.isFinite(n);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
function validateConfig(c:AmdValidationConfig):string[]{
 const e:string[]=[];
 try{new Intl.DateTimeFormat('en-US',{timeZone:c.timezone});}catch{e.push('Invalid timezone');}
 if(!finite(c.sweepSensitivityBps)||c.sweepSensitivityBps<0||c.sweepSensitivityBps>50)e.push('Sweep sensitivity must be between 0 and 50 bps');
 if(!finite(c.minArrayStrength)||c.minArrayStrength<50||c.minArrayStrength>100)e.push('PD Array strength threshold must be between 50 and 100');
 if(!finite(c.rewardRisk)||c.rewardRisk<0.5||c.rewardRisk>10)e.push('Reward/risk must be between 0.5 and 10');
 if(!finite(c.feeBps)||c.feeBps<0||c.feeBps>100)e.push('Fee must be between 0 and 100 bps');
 if(!finite(c.slippageBps)||c.slippageBps<0||c.slippageBps>100)e.push('Slippage must be between 0 and 100 bps');
 if(!finite(c.initialEquity)||c.initialEquity<=0)e.push('Initial equity must be positive');
 if(!finite(c.riskPct)||c.riskPct<=0||c.riskPct>2)e.push('Risk per trade must be greater than 0 and no more than 2 percent');
 if(!Number.isInteger(c.maxHoldingCandles)||c.maxHoldingCandles<1||c.maxHoldingCandles>300)e.push('Maximum holding candles must be an integer between 1 and 300');
 return e;
}
const validationFormatterCache=new Map<string,Intl.DateTimeFormat>();
function local(c:StrategyCandle,tz:string){let formatter=validationFormatterCache.get(tz);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});validationFormatterCache.set(tz,formatter);}const p=formatter.formatToParts(new Date(c.closeTime));const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return {date:v.year+'-'+v.month+'-'+v.day,minute:Number(v.hour)*60+Number(v.minute)};}
function average(v:number[]){return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
function atr(c:StrategyCandle[],index:number){const start=Math.max(1,index-14),v:number[]=[];for(let i=start;i<=index;i++){const x=c[i],p=c[i-1];v.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));}return average(v);}
function metrics(trades:AmdReplayTrade[],initialEquity:number):{metrics:AmdMetrics;equityCurve:{time:number;equity:number;drawdownPct:number}[]}{
 let equity=initialEquity,peak=initialEquity,maxDD=0;const curve:{time:number;equity:number;drawdownPct:number}[]=[];
 for(const t of trades.slice().sort((a,b)=>a.exitTime-b.exitTime)){equity+=t.netPnl;peak=Math.max(peak,equity);const dd=peak>0?(peak-equity)/peak*100:0;maxDD=Math.max(maxDD,dd);curve.push({time:t.exitTime,equity,drawdownPct:dd});}
 const wins=trades.filter(t=>t.netR>0),losses=trades.filter(t=>t.netR<=0),grossWin=wins.reduce((s,t)=>s+t.netPnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.netPnl,0));
 const net=trades.reduce((s,t)=>s+t.netPnl,0),rs=trades.map(t=>t.netR),mfe=trades.map(t=>t.mfeR),mae=trades.map(t=>t.maeR);
 let maxWins=0,maxLosses=0,winStreak=0,lossStreak=0;for(const t of trades){if(t.netR>0){winStreak++;lossStreak=0;}else{lossStreak++;winStreak=0;}maxWins=Math.max(maxWins,winStreak);maxLosses=Math.max(maxLosses,lossStreak);}const sortedR=rs.slice().sort((a,b)=>a-b),medianR=sortedR.length?(sortedR.length%2?sortedR[(sortedR.length-1)/2]:(sortedR[sortedR.length/2-1]+sortedR[sortedR.length/2])/2):0;
 return {metrics:{trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?wins.length/trades.length*100:0,netPnl:net,returnPct:net/initialEquity*100,expectancyR:average(rs),medianR,maxConsecutiveWins:maxWins,maxConsecutiveLosses:maxLosses,recoveryFactor:maxDD>0?net/(initialEquity*maxDD/100):null,profitFactor:grossLoss>0?grossWin/grossLoss:grossWin>0?null:0,maxDrawdownPct:maxDD,averageR:average(rs),averageMfeR:average(mfe),averageMaeR:average(mae),averageMfePct:average(trades.map(t=>t.entry>0?t.mfe/t.entry*100:0)),averageMaePct:average(trades.map(t=>t.entry>0?t.mae/t.entry*100:0)),averageBarsHeld:average(trades.map(t=>t.barsHeld)),longTrades:trades.filter(t=>t.side==='long').length,shortTrades:trades.filter(t=>t.side==='short').length},equityCurve:curve};
}
function bootstrap(trades:AmdReplayTrade[],iterations=1000){if(trades.length<5)return {iterations,expectancyR95:null as [number,number]|null,winRatePct95:null as [number,number]|null,sampleAdequate:false};let seed=42;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};const e:number[]=[],w:number[]=[];for(let i=0;i<iterations;i++){let sum=0,wins=0;for(let j=0;j<trades.length;j++){const t=trades[Math.floor(rand()*trades.length)];sum+=t.netR;if(t.netR>0)wins++;}e.push(sum/trades.length);w.push(wins/trades.length*100);}e.sort((a,b)=>a-b);w.sort((a,b)=>a-b);return {iterations,expectancyR95:[e[Math.floor(iterations*.025)],e[Math.floor(iterations*.975)]] as [number,number],winRatePct95:[w[Math.floor(iterations*.025)],w[Math.floor(iterations*.975)]] as [number,number],sampleAdequate:true};}
export function amdCostSensitivity(candles:StrategyCandle[],config:Partial<AmdValidationConfig>={},extraBps=[0,5,10]){return extraBps.map(extra=>{const result=replayAmdSessions(candles,{...config,slippageBps:(config.slippageBps??DEFAULT_AMD_VALIDATION_CONFIG.slippageBps)+extra});return {extraSlippageBps:extra,metrics:result.metrics,valid:result.valid};});}
function regime(candles:StrategyCandle[]):'bullish'|'bearish'|'ranging'{if(candles.length<2)return 'ranging';const first=candles[0].open,last=candles[candles.length-1].close,change=first>0?(last-first)/first:0;return change>.003?'bullish':change<-.003?'bearish':'ranging';}
function isAmdCandidate(session:StrategyCandle[],distribution:StrategyCandle[],index:number,manipulation:StrategyCandle[],config:AmdValidationConfig,arrays:{side:string;low:number;high:number;strength:number}[]){
 const c=distribution[index],allPrior=[...manipulation,...distribution.slice(0,index)],vol=atr(session,session.indexOf(c)),s=config.sweepSensitivityBps/10000;
 const hi=Math.max(...manipulation.map(x=>x.high)),lo=Math.min(...manipulation.map(x=>x.low));
 const sweep=(c.high>hi*(1+s)&&c.close<hi)||(c.low<lo*(1-s)&&c.close>lo);
 const bear=manipulation.slice().reverse().find(x=>x.close<x.open),bull=manipulation.slice().reverse().find(x=>x.close>x.open);
 const cisd=!!vol&&vol>0&&((!!bear&&c.close>bear.open&&c.close>c.open&&c.close-c.open>=vol*.35)||(!!bull&&c.close<bull.open&&c.close<c.open&&c.open-c.close>=vol*.35));
 const prior=allPrior.slice(-10),mss=prior.length>=5&&!!vol&&vol>0&&((c.close>Math.max(...prior.map(x=>x.high))&&c.close-c.open>=vol*.35)||(c.close<Math.min(...prior.map(x=>x.low))&&c.open-c.close>=vol*.35));
 const arrayTouch=arrays.some(z=>z.strength>=config.minArrayStrength&&c.high>=z.low&&c.low<=z.high);
 return sweep||cisd||mss||arrayTouch;
}
export function replayAmdSessions(input:StrategyCandle[],overrides:Partial<AmdValidationConfig>={}):AmdReplayResult{
 const config={...DEFAULT_AMD_VALIDATION_CONFIG,...overrides},errors=validateConfig(config);
 if(!input.length)errors.push('No historical candles supplied');
 const candles=input.slice().sort((a,b)=>a.closeTime-b.closeTime);
 for(let i=0;i<candles.length;i++){const c=candles[i];if(![c.openTime,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(finite)||c.open<=0||c.low<=0||c.high<c.low||c.close<c.low||c.close>c.high||c.volume<0||(i>0&&c.closeTime<=candles[i-1].closeTime)){errors.push('Invalid, out-of-order, or non-monotonic candle at index '+i);break;}}
 if(errors.length)return {valid:false,errors,config,sourceCandles:candles.length,sessions:0,qualifiedSignals:0,rejectedSignals:0,trades:[],metrics:null,equityCurve:[],uncertainty:null,regimeBreakdown:[]};
 const groups=new Map<string,StrategyCandle[]>();for(const c of candles){const x=local(c,config.timezone);if(x.minute>=180&&x.minute<720){const a=groups.get(x.date)||[];a.push(c);groups.set(x.date,a);}}
 const trades:AmdReplayTrade[]=[],regimes=new Map<string,{sessions:number;trades:AmdReplayTrade[]}>();let currentEquity=config.initialEquity;
 let qualifiedSignals=0,rejectedSignals=0;
 for(const [date,session] of groups){
  const acc=session.filter(c=>local(c,config.timezone).minute>=180&&local(c,config.timezone).minute<360);
  const manip=session.filter(c=>local(c,config.timezone).minute>=360&&local(c,config.timezone).minute<540);
  const dist=session.filter(c=>local(c,config.timezone).minute>=540&&local(c,config.timezone).minute<720);
  if(acc.length<3||manip.length<6||dist.length<2)continue;
  const sessionRegime=regime(session);const bucket=regimes.get(sessionRegime)||{sessions:0,trades:[]};bucket.sessions++;regimes.set(sessionRegime,bucket);
  const pdArrays=buildAmdPdArrays(manip,config.minArrayStrength);let entered=false;
  for(let i=0;i<dist.length-1&&!entered;i++){
   const signal=dist[i],signalIndex=session.indexOf(signal);
   if(!isAmdCandidate(session,dist,i,manip,config,pdArrays)){rejectedSignals++;continue;}
   const history=session.slice(0,signalIndex+1),assessment=analyseAmdSession(history,signal.closeTime,config.timezone,{sweepSensitivityBps:config.sweepSensitivityBps,minArrayStrength:config.minArrayStrength});
   if(!assessment.qualified){rejectedSignals++;continue;}
   qualifiedSignals++;
   const next=dist[i+1],side=assessment.direction==='bullish'?'long':assessment.direction==='bearish'?'short':null;
   if(!side)continue;
   const entry=next.open,vol=atr(session,signalIndex),buffer=Math.max(vol*.15,entry*config.sweepSensitivityBps/10000);
   const structural=side==='long'?assessment.manipulationRange.low:assessment.manipulationRange.high;
   if(!(entry>0&&vol>0&&structural!==null)){rejectedSignals++;continue;}
   const stop=side==='long'?Math.min(structural-buffer,entry-vol*.5):Math.max(structural+buffer,entry+vol*.5);
   const initialRisk=Math.abs(entry-stop);if(!(initialRisk>entry*0.0001)){rejectedSignals++;continue;}
   const target=side==='long'?entry+initialRisk*config.rewardRisk:entry-initialRisk*config.rewardRisk;
   const end=Math.min(dist.length,i+1+config.maxHoldingCandles),path=dist.slice(i+1,end);
   if(!path.length)continue;
   let exit=path[path.length-1].close,exitTime=path[path.length-1].closeTime,exitReason:AmdReplayTrade['exitReason']='session-end',mfe=0,mae=0,barsHeld=0;
   for(const c of path){barsHeld++;const fav=side==='long'?c.high-entry:entry-c.low,adv=side==='long'?entry-c.low:c.high-entry;mfe=Math.max(mfe,fav);mae=Math.max(mae,adv);
    const stopHit=side==='long'?c.low<=stop:c.high>=stop,targetHit=side==='long'?c.high>=target:c.low<=target;
    if(stopHit||targetHit){exit=stopHit?stop:target;exitTime=c.closeTime;exitReason=stopHit?'stop':'target';break;}
   }
   const direction=side==='long'?1:-1,riskAmount=currentEquity*config.riskPct/100,quantity=riskAmount/initialRisk,grossPnl=(exit-entry)*direction*quantity,roundTripCost=entry*quantity*(config.feeBps+config.slippageBps)*2/10000,netPnl=grossPnl-roundTripCost,netR=netPnl/riskAmount;currentEquity+=netPnl;
   const trade:AmdReplayTrade={sessionDate:date,side,signalTime:signal.closeTime,entryTime:next.openTime,exitTime,entry,stop,target,exit,exitReason,initialRisk,grossPnl,costs:roundTripCost,netPnl,netR,mfe,mae,mfeR:mfe/initialRisk,maeR:mae/initialRisk,barsHeld,qualification:assessment};
   trades.push(trade);bucket.trades.push(trade);entered=true;
  }
 }
 const summary=metrics(trades,config.initialEquity);
 const regimeBreakdown=[...regimes.entries()].map(([key,v])=>({regime:key as 'bullish'|'bearish'|'ranging',sessions:v.sessions,trades:v.trades.length,winRatePct:v.trades.length?v.trades.filter(t=>t.netR>0).length/v.trades.length*100:0,expectancyR:average(v.trades.map(t=>t.netR)),netPnl:v.trades.reduce((s,t)=>s+t.netPnl,0)}));
 return {valid:true,errors:[],config,sourceCandles:candles.length,sessions:groups.size,qualifiedSignals,rejectedSignals,trades,metrics:summary.metrics,equityCurve:summary.equityCurve,uncertainty:bootstrap(trades),regimeBreakdown};
}
function splitByLocalDays(candles:StrategyCandle[],timezone:string,ratio:number){const dates=[...new Set(candles.map(c=>local(c,timezone).date))].sort(),cut=Math.max(1,Math.min(dates.length-1,Math.floor(dates.length*ratio))),trainDates=new Set(dates.slice(0,cut));return {train:candles.filter(c=>trainDates.has(local(c,timezone).date)),test:candles.filter(c=>!trainDates.has(local(c,timezone).date))};}
export type AmdOptimisationCandidate={config:AmdValidationConfig;train:AmdMetrics;holdout:AmdMetrics;score:number;robust:boolean};
export function optimiseAmdParameters(candles:StrategyCandle[],options:{timezones?:string[];sweepSensitivitiesBps?:number[];arrayStrengths?:number[];minTrainTrades?:number;minHoldoutTrades?:number}={}){
 const requestedTimezones=[...new Set(options.timezones??[DEFAULT_AMD_TIMEZONE,'Africa/Accra','Europe/London','America/New_York'])].slice(0,6),invalidTimezones=requestedTimezones.filter(tz=>{try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return false;}catch{return true;}}),timezones=requestedTimezones.filter(tz=>!invalidTimezones.includes(tz));
 const sweeps=(options.sweepSensitivitiesBps??[0,3,5,10]).slice(0,6),strengths=(options.arrayStrengths??[65,70,75,80]).slice(0,6);
 const candidates:AmdOptimisationCandidate[]=[];
 for(const timezone of timezones)for(const sweep of sweeps)for(const strength of strengths){
  const config={...DEFAULT_AMD_VALIDATION_CONFIG,timezone,sweepSensitivityBps:sweep,minArrayStrength:strength};
  const dates=[...new Set(candles.map(c=>local(c,timezone).date))].sort(),cut=Math.max(1,Math.min(dates.length-1,Math.floor(dates.length*.7))),trainDates=new Set(dates.slice(0,cut)),trainCandles=candles.filter(c=>trainDates.has(local(c,timezone).date)),holdoutCandles=candles.filter(c=>!trainDates.has(local(c,timezone).date));
  const train=replayAmdSessions(trainCandles,config),holdout=replayAmdSessions(holdoutCandles,config);
  if(!train.valid||!holdout.valid||!train.metrics||!holdout.metrics)continue;
  const minTrain=options.minTrainTrades??20,minHold=options.minHoldoutTrades??8;
  const score=train.metrics.trades>=minTrain?train.metrics.expectancyR*Math.sqrt(train.metrics.trades)-train.metrics.maxDrawdownPct/100: -999;
  const robust=train.metrics.trades>=minTrain&&holdout.metrics.trades>=minHold&&train.metrics.expectancyR>0&&holdout.metrics.expectancyR>0&&holdout.metrics.maxDrawdownPct<=Math.max(10,train.metrics.maxDrawdownPct*1.75);
  candidates.push({config,train:train.metrics,holdout:holdout.metrics,score,robust});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const best=candidates[0]??null;
 return {valid:!!best,candidateCount:candidates.length,invalidTimezones,split:{method:'chronological local-session-date boundary per candidate timezone',holdoutUntouchedDuringSelection:true},best,top:candidates.slice(0,10),warnings:best?.robust?[]:['No candidate passed minimum sample and positive holdout expectancy robustness checks; do not promote a configuration']};
}
export function walkForwardAmd(candles:StrategyCandle[],folds=4){
 const n=clamp(Math.floor(folds),2,8),results:{fold:number;trainCandles:number;testCandles:number;selected:AmdValidationConfig|null;train:AmdMetrics|null;test:AmdMetrics|null;passed:boolean}[]=[];
 const timezone=DEFAULT_AMD_TIMEZONE,{train:allTrain,test:finalTest}=splitByLocalDays(candles,timezone,.8);
 const dates=[...new Set(allTrain.map(c=>local(c,timezone).date))].sort(),chunk=Math.max(1,Math.floor(dates.length/(n+1)));
 for(let i=0;i<n;i++){const trainEnd=chunk*(i+1),testEnd=Math.min(dates.length,trainEnd+chunk),trainDates=new Set(dates.slice(0,trainEnd)),testDates=new Set(dates.slice(trainEnd,testEnd)),train=allTrain.filter(c=>trainDates.has(local(c,timezone).date)),test=allTrain.filter(c=>testDates.has(local(c,timezone).date));
  const opt=optimiseAmdParameters(train,{timezones:[DEFAULT_AMD_TIMEZONE,'Africa/Accra'],sweepSensitivitiesBps:[0,5],arrayStrengths:[65,80],minTrainTrades:5,minHoldoutTrades:2});
  const selected=opt.best?.config??null,validation=selected?replayAmdSessions(test,selected):null,trainResult=selected?replayAmdSessions(train,selected):null;
  results.push({fold:i+1,trainCandles:train.length,testCandles:test.length,selected,train:trainResult?.metrics??null,test:validation?.metrics??null,passed:!!validation?.metrics&&validation.metrics.trades>=3&&validation.metrics.expectancyR>0});
 }
 const finalOpt=optimiseAmdParameters(allTrain,{timezones:[DEFAULT_AMD_TIMEZONE,'Africa/Accra','Europe/London'],sweepSensitivitiesBps:[0,5,10],arrayStrengths:[65,75,85],minTrainTrades:8,minHoldoutTrades:3});
 const finalResult=finalOpt.best?replayAmdSessions(finalTest,finalOpt.best.config):null;
 return {valid:results.length===n&&results.every(x=>x.test!==null),folds:results,aggregate:{folds:n,passedFolds:results.filter(x=>x.passed).length,meanTestExpectancyR:average(results.map(x=>x.test?.expectancyR??0)),meanTestWinRatePct:average(results.map(x=>x.test?.winRatePct??0))},finalUntouchedOutOfSample:{candles:finalTest.length,selectedConfig:finalOpt.best?.config??null,metrics:finalResult?.metrics??null,passed:!!finalResult?.metrics&&finalResult.metrics.trades>=8&&finalResult.metrics.expectancyR>0},liveExecutionEnabled:false};
}
export type AmdArbitrationInput={amd:AmdAssessment;strategy:{valid:boolean;side:'long'|'short'|'none';confidence:number;reasons?:string[]};evidence?:{stance:'bullish'|'bearish'|'neutral'|'risk'|'incomplete';confidence:number;hardBlock:boolean;source:string}[]};
export function arbitrateAmdOpportunity(input:AmdArbitrationInput){
 const reasons:string[]=[];let score=0;const direction=input.amd.direction;
 if(!input.amd.qualified||!input.amd.entryAllowed)reasons.push('AMD session conditions are not qualified');
 if(!input.strategy.valid||input.strategy.side==='none')reasons.push('Independent strategy has no valid trade plan');
 const expected=direction==='bullish'?'long':direction==='bearish'?'short':'none';
 if(expected==='none'||input.strategy.side!==expected)reasons.push('AMD direction conflicts with the independent strategy direction');
 if(!finite(input.strategy.confidence)||input.strategy.confidence<60)reasons.push('Independent strategy confidence is below 60');
 for(const e of input.evidence??[]){if(e.hardBlock)reasons.push('Hard block from '+e.source);if(e.stance==='risk'||e.stance==='incomplete')reasons.push('Risk or incomplete evidence from '+e.source);if((e.stance==='bullish'&&direction==='bearish')||(e.stance==='bearish'&&direction==='bullish'))reasons.push('Directional evidence conflict from '+e.source);if(e.stance===direction&&e.confidence>=60)score+=e.confidence/10;}
 if(direction!=='neutral'&&input.strategy.side===expected)score+=input.strategy.confidence/10;
 const approved=reasons.length===0&&score>=6;
 return {approved,score:Math.round(score*100)/100,direction,side:expected,reasons:approved?['AMD, independent strategy and available evidence agree']:reasons,liveExecutionEnabled:false};
}
export function buildAmdForwardRecord(input:{symbol:string;assessment:AmdAssessment;observedAt:number;strategy?:{valid:boolean;side:'long'|'short'|'none';confidence:number};paperEnabled:boolean}){
 const arbitration=input.strategy?arbitrateAmdOpportunity({amd:input.assessment,strategy:input.strategy}):null;
 const qualified=input.assessment.qualified,status=!qualified||(!!arbitration&&!arbitration.approved)?'rejected':!input.paperEnabled?'missed':'qualified';
 return {symbol:input.symbol,sessionDate:input.assessment.sessionDate,observedAt:input.observedAt,phase:input.assessment.phase,status,qualified,direction:input.assessment.direction,reason:[...input.assessment.reason,...(arbitration?.reasons??[]),...(!input.paperEnabled&&qualified?['Forward observer only: automatic paper entry is disabled']:[])],entryZone:input.assessment.entryZone,arbitration,paperOrderAttempted:false,liveExecutionEnabled:false};
}
