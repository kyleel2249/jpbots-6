import type { BacktestCandle } from './backtesting';
export type StrategyCandle = BacktestCandle;
export type Timeframes = { '5m': StrategyCandle[]; '15m': StrategyCandle[]; '1h': StrategyCandle[]; '4h': StrategyCandle[] };
export type StrategyConfig = { riskPct:number; feeBps:number; slippageBps:number; spreadBps:number; impactBps:number; minRewardRisk:number; atrPeriod:number; swingLookback:number; maxEntryDistanceAtr:number; };
export const defaultInstitutionalStrategyConfig:StrategyConfig={riskPct:.2,feeBps:10,slippageBps:5,spreadBps:2,impactBps:2,minRewardRisk:1.5,atrPeriod:14,swingLookback:20,maxEntryDistanceAtr:2.5};
export type TradePlan={valid:boolean;side:'long'|'short'|'none';entry:number|null;stop:number|null;target:number|null;quantity:number;riskCash:number;rewardRisk:number|null;costBps:number;confidence:number;timeframeAlignment:Record<string,string>;setup:string;reasons:string[];levels:{fvg:Array<{low:number;high:number;mid:number;side:string}>;liquidity:Array<{price:number;side:string}>;invalidation:number|null}};
const finite=(n:number)=>Number.isFinite(n);
function ema(values:number[],period:number):(number|null)[]{const out:(number|null)[]=Array(values.length).fill(null);if(values.length<period)return out;let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;out[period-1]=v;const k=2/(period+1);for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v;}return out;}
function atr(cs:StrategyCandle[],period:number){if(cs.length<period+1)return null;const tr=cs.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-cs[i].close),Math.abs(c.low-cs[i].close)));return tr.slice(-period).reduce((a,b)=>a+b,0)/period;}
export function trendAt(cs:StrategyCandle[],time:number,fast=9,slow=21):'bullish'|'bearish'|'neutral'{const closed=cs.filter(c=>c.closeTime<=time);if(closed.length<slow+2)return 'neutral';const closes=closed.map(c=>c.close),f=ema(closes,fast).at(-1),s=ema(closes,slow).at(-1);return f==null||s==null?'neutral':f>s?'bullish':f<s?'bearish':'neutral';}
function fvgZones(cs:StrategyCandle[]){const zones:{low:number;high:number;mid:number;side:'long'|'short';index:number}[]=[];for(let i=2;i<cs.length;i++){const a=cs[i-2],c=cs[i];if(c.low>a.high)zones.push({low:a.high,high:c.low,mid:(a.high+c.low)/2,side:'long',index:i});if(c.high<a.low)zones.push({low:c.high,high:a.low,mid:(c.high+a.low)/2,side:'short',index:i});}return zones;}
function liquidity(cs:StrategyCandle[],lookback:number){const tail=cs.slice(-lookback);if(tail.length<5)return {high:null as number|null,low:null as number|null};return {high:Math.max(...tail.slice(0,-1).map(c=>c.high)),low:Math.min(...tail.slice(0,-1).map(c=>c.low))};}
function validateCandles(cs:StrategyCandle[]){return cs.length>=50&&cs.every((c,i)=>[c.openTime,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(finite)&&c.open>0&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.volume>=0&&(i===0||c.openTime>cs[i-1].openTime));}
export function buildInstitutionalTradePlan(tf:Timeframes,equity:number,config:StrategyConfig=defaultInstitutionalStrategyConfig,now=Date.now()):TradePlan{
 const reasons:string[]=[];const base=tf['5m']??[];if(!validateCandles(base))reasons.push('At least 50 valid, chronologically ordered 5-minute candles are required');
 for(const key of ['15m','1h','4h'] as const)if(!validateCandles(tf[key]??[]))reasons.push('Insufficient or invalid '+key+' higher-timeframe history');
 if(!finite(equity)||equity<=0)reasons.push('Paper equity is unavailable');
 if([config.riskPct,config.feeBps,config.slippageBps,config.spreadBps,config.impactBps,config.minRewardRisk,config.atrPeriod,config.swingLookback,config.maxEntryDistanceAtr].some(x=>!finite(x))||config.riskPct<=0||config.riskPct>.25||config.feeBps<0||config.slippageBps<0||config.spreadBps<0||config.impactBps<0||config.minRewardRisk<1.2)reasons.push('Strategy cost or risk configuration violates policy');
 const last=base.at(-1);if(!last)return emptyPlan(reasons);
 if(now<last.closeTime||now-last.closeTime>360_000)reasons.push('5-minute market data is stale');
 const align:Record<string,string>={'5m':trendAt(base,last.closeTime),'15m':trendAt(tf['15m'],last.closeTime),'1h':trendAt(tf['1h'],last.closeTime),'4h':trendAt(tf['4h'],last.closeTime)};
 const longVotes=Object.values(align).filter(x=>x==='bullish').length,shortVotes=Object.values(align).filter(x=>x==='bearish').length;
 const side:'long'|'short'|'none'=longVotes>=3&&align['1h']==='bullish'&&align['4h']==='bullish'?'long':shortVotes>=3&&align['1h']==='bearish'&&align['4h']==='bearish'?'short':'none';
 if(side==='none')reasons.push('Multi-timeframe trend alignment is insufficient');
 const volatility=atr(base,config.atrPeriod);if(!volatility||!finite(volatility)||volatility<=0)reasons.push('ATR volatility estimate unavailable');
 const zones=fvgZones(base).filter(z=>z.index>=base.length-60),pools=liquidity(base,config.swingLookback),price=last.close;
 const relevant=zones.filter(z=>z.side===side&&Math.abs(z.mid-price)<=((volatility??0)*config.maxEntryDistanceAtr)).sort((a,b)=>Math.abs(a.mid-price)-Math.abs(b.mid-price))[0];
 if(!relevant)reasons.push('No recent, directionally aligned FVG within the ATR entry distance');
 const entry=relevant?.mid??null,buffer=(volatility??0)*.2;
 const stop=side==='long'&&pools.low!==null?Math.min(pools.low,entry??price)-buffer:side==='short'&&pools.high!==null?Math.max(pools.high,entry??price)+buffer:null;
 if(stop===null||entry===null||(side==='long'&&stop>=entry)||(side==='short'&&stop<=entry))reasons.push('A structurally valid swing-based stop could not be generated');
 const risk=entry!==null&&stop!==null?Math.abs(entry-stop):0,target=entry!==null&&stop!==null?entry+(side==='long'?1:-1)*risk*Math.max(config.minRewardRisk,2):null;
 const costBps=2*config.feeBps+2*config.slippageBps+config.spreadBps+config.impactBps;
 const grossRR=risk>0&&entry!==null&&target!==null?Math.abs(target-entry)/risk:null;
 const costPerUnit=entry!==null?entry*costBps/10_000:0,netRR=grossRR!==null&&risk>0?(Math.abs((target??0)-(entry??0))-costPerUnit)/(risk+costPerUnit):null;
 if(netRR===null||netRR<config.minRewardRisk)reasons.push('Net reward-to-risk is below the configured threshold after estimated costs');
 const riskCash=equity*config.riskPct/100,quantity=risk>0?Math.min(riskCash/(risk+costPerUnit),equity/Math.max(entry??1,1)):0;
 if(!finite(quantity)||quantity<=0)reasons.push('Risk-based position sizing is invalid');
 const confidence=Math.max(0,Math.min(95,Math.round((Math.max(longVotes,shortVotes)/4)*60+(relevant?20:0)+(netRR!==null&&netRR>=2?15:0))));
 const valid=reasons.length===0;
 return {valid,side:valid?side:'none',entry:valid?entry:null,stop:valid?stop:null,target:valid?target:null,quantity:valid?quantity:0,riskCash:valid?riskCash:0,rewardRisk:valid?netRR:null,costBps,confidence,timeframeAlignment:align,setup:relevant?(relevant.side+' FVG retracement with multi-timeframe trend confirmation'):'No qualified institutional setup',reasons,levels:{fvg:zones.slice(-20).map(z=>({low:z.low,high:z.high,mid:z.mid,side:z.side})),liquidity:[...(pools.high!==null?[{price:pools.high,side:'buy-side'}]:[]),...(pools.low!==null?[{price:pools.low,side:'sell-side'}]:[])],invalidation:valid?stop:null}};
}
function emptyPlan(reasons:string[]):TradePlan{return {valid:false,side:'none',entry:null,stop:null,target:null,quantity:0,riskCash:0,rewardRisk:null,costBps:0,confidence:0,timeframeAlignment:{},setup:'No qualified setup',reasons,levels:{fvg:[],liquidity:[],invalidation:null}};}
type SimTrade={side:'long'|'short';entry:number;exit:number;entryTime:number;exitTime:number;netPnl:number;netPct:number;exitReason:string;costBps:number};
function metrics(trades:SimTrade[],initial:number,equityCurve:number[]){const wins=trades.filter(t=>t.netPnl>0),losses=trades.filter(t=>t.netPnl<0),grossWin=wins.reduce((s,t)=>s+t.netPnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.netPnl,0));let peak=initial,maxDd=0;for(const e of equityCurve){peak=Math.max(peak,e);maxDd=Math.max(maxDd,peak?(peak-e)/peak*100:100);}const net=equityCurve.at(-1)!-initial;return {tradeCount:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?wins.length/trades.length*100:0,netPnl:net,netReturnPct:net/initial*100,profitFactor:grossLoss?grossWin/grossLoss:grossWin?null:0,expectancy:trades.length?net/trades.length:0,maxDrawdownPct:maxDd,finalEquity:equityCurve.at(-1)!};}
export function replayInstitutionalStrategy(base:StrategyCandle[],higher:Pick<Timeframes,'15m'|'1h'|'4h'>,config:StrategyConfig=defaultInstitutionalStrategyConfig,initialEquity=10_000){
 const errors:string[]=[];if(!validateCandles(base))errors.push('At least 50 valid base candles are required');for(const k of ['15m','1h','4h'] as const)if(!validateCandles(higher[k]))errors.push('Invalid or insufficient '+k+' history');if(!finite(initialEquity)||initialEquity<=0)errors.push('Initial equity must be positive');if(errors.length)return {valid:false,errors,trades:[] as SimTrade[],metrics:null};
 const costs=(2*config.feeBps+2*config.slippageBps+config.spreadBps+config.impactBps)/10_000;let equity=initialEquity,peak=equity,position:{side:'long'|'short';entry:number;stop:number;target:number;entryTime:number;qty:number}|null=null;const trades:SimTrade[]=[],curve=[equity];
 for(let i=50;i<base.length-1;i++){
  const c=base[i],next=base[i+1];
  if(position){
   const adverse=position.side==='long'?c.low:c.high,unrealised=(position.side==='long'?adverse-position.entry:position.entry-adverse)*position.qty-(position.entry+adverse)*position.qty*costs/2,worstEquity=equity+unrealised;
   peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-worstEquity)/peak*100:100);curve.push(worstEquity);
   const hitStop=position.side==='long'?c.low<=position.stop:c.high>=position.stop,hitTarget=position.side==='long'?c.high>=position.target:c.low<=position.target;
   if(hitStop||hitTarget){const exit=hitStop?position.stop:position.target,move=(position.side==='long'?exit-position.entry:position.entry-exit)*position.qty,fee=(position.entry+exit)*position.qty*costs/2,net=move-fee;equity+=net;trades.push({side:position.side,entry:position.entry,exit,entryTime:position.entryTime,exitTime:c.closeTime,netPnl:net,netPct:net/Math.max(equity-net,1)*100,exitReason:hitStop?'stop-loss':'take-profit',costBps:costs*10_000});position=null;curve.push(equity);}
   continue;
  }
  const snap=(key:'15m'|'1h'|'4h')=>trendAt(higher[key],c.openTime);
  const dirs=[trendAt(base,c.openTime),snap('15m'),snap('1h'),snap('4h')],long=dirs.filter(x=>x==='bullish').length>=3&&dirs[2]==='bullish'&&dirs[3]==='bullish',short=dirs.filter(x=>x==='bearish').length>=3&&dirs[2]==='bearish'&&dirs[3]==='bearish';if(!long&&!short)continue;
  const zones=fvgZones(base.slice(0,i)).filter(z=>z.index>=i-60&&z.side===(long?'long':'short')&&c.low<=z.high&&c.high>=z.low&&(long?c.close>=z.mid:c.close<=z.mid)),zone=zones.at(-1);if(!zone)continue;
  const a=atr(base.slice(0,i+1),config.atrPeriod);if(!a)continue;const entry=next.open,stop=long?Math.min(...base.slice(Math.max(0,i-config.swingLookback),i).map(x=>x.low))-a*.2:Math.max(...base.slice(Math.max(0,i-config.swingLookback),i).map(x=>x.high))+a*.2,risk=Math.abs(entry-stop);if(!(risk>0)||Math.abs(entry-zone.mid)>a*config.maxEntryDistanceAtr)continue;
  const target=entry+(long?1:-1)*risk*Math.max(config.minRewardRisk,2),costPerUnit=entry*costs,netRR=(risk*2-costPerUnit)/(risk+costPerUnit);if(netRR<config.minRewardRisk)continue;
  const qty=Math.min(equity*config.riskPct/100/(risk+costPerUnit),equity/entry);if(!(qty>0))continue;position={side:long?'long':'short',entry,stop,target,entryTime:next.openTime,qty};
 }
 if(position){const last=base.at(-1)!,exit=last.close,move=(position.side==='long'?exit-position.entry:position.entry-exit)*position.qty,fee=(position.entry+exit)*position.qty*costs/2,net=move-fee;equity+=net;trades.push({side:position.side,entry:position.entry,exit,entryTime:position.entryTime,exitTime:last.closeTime,netPnl:net,netPct:net/Math.max(equity-net,1)*100,exitReason:'end-of-replay',costBps:costs*10_000});curve.push(equity);}
 return {valid:true,errors:[],trades,metrics:metrics(trades,initialEquity,curve)};
}
export function walkForwardInstitutionalStrategy(base:StrategyCandle[],higher:Pick<Timeframes,'15m'|'1h'|'4h'>,config:StrategyConfig=defaultInstitutionalStrategyConfig,initialEquity=10_000,folds=4){
 const errors:string[]=[];if(!Number.isInteger(folds)||folds<2||folds>8)errors.push('Walk-forward folds must be 2..8');if(base.length<250)errors.push('At least 250 base candles are required for walk-forward validation');if(errors.length)return {valid:false,errors,folds:[] as any[],outOfSample:{candles:0,metrics:null as any},aggregate:null as any};
 const holdout=Math.floor(base.length*.2),development=base.slice(0,base.length-holdout),oos=base.slice(base.length-holdout),foldSize=Math.floor(development.length/(folds+1)),foldResults=[];if(foldSize<50)return {valid:false,errors:['Each rolling validation window must contain at least 50 candles'],folds:[] as any[],outOfSample:{candles:oos.length,metrics:null as any},aggregate:null as any};
 for(let i=1;i<=folds;i++){const trainEnd=foldSize*i,testEnd=Math.min(development.length,trainEnd+foldSize);if(testEnd-trainEnd<30)continue;const train=development.slice(0,trainEnd),test=development.slice(trainEnd,testEnd),trained= replayInstitutionalStrategy(train,higher,config,initialEquity),tested=replayInstitutionalStrategy(test,higher,config,initialEquity);foldResults.push({fold:i,trainCandles:train.length,testCandles:test.length,train:trained.metrics,test:tested.metrics});}
 const finalOos=replayInstitutionalStrategy(oos,higher,config,initialEquity),positive=foldResults.filter(f=>(f.test?.expectancy??0)>0).length;
 return {valid:foldResults.length>=2&&finalOos.valid,errors:foldResults.length>=2?[]:['Insufficient walk-forward test windows'],folds:foldResults,outOfSample:{candles:oos.length,metrics:finalOos.metrics},aggregate:{positiveFolds:positive,totalFolds:foldResults.length,positiveFoldRatePct:foldResults.length?positive/foldResults.length*100:0,oosExpectancy:finalOos.metrics?.expectancy??null,oosNetReturnPct:finalOos.metrics?.netReturnPct??null,liveExecutionEnabled:false as const}};
}
