import type { StrategyCandle } from './institutional-strategy';

export type AmdPhase='accumulation'|'manipulation'|'distribution'|'inactive';
export type AmdDirection='bullish'|'bearish'|'neutral';
export type AmdArray={kind:'fvg'|'order-block';side:AmdDirection;low:number;high:number;mid:number;strength:number;formedAt:number};
export type AmdAssessment={
 phase:AmdPhase;sessionDate:string;timezone:string;localTime:string;entryAllowed:boolean;qualified:boolean;
 direction:AmdDirection;reason:string[];accumulationRange:{high:number|null;low:number|null};
 manipulationRange:{high:number|null;low:number|null};sweeps:{high:boolean;low:boolean};
 structure:{cisd:AmdDirection;mss:AmdDirection;confirmed:AmdDirection};
 pdArrays:AmdArray[];activeArray:AmdArray|null;entryZone:{low:number;high:number;mid:number}|null;
};

export const DEFAULT_AMD_TIMEZONE='UTC';
const finite=(x:number)=>Number.isFinite(x);
function localParts(time:number,timeZone:string){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));
 const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
 return {date:v.year+'-'+v.month+'-'+v.day,hour:Number(v.hour),minute:Number(v.minute),clock:v.hour+':'+v.minute};
}
function range(cs:StrategyCandle[]){return cs.length?{high:Math.max(...cs.map(c=>c.high)),low:Math.min(...cs.map(c=>c.low))}:{high:null,low:null};}
function average(xs:number[]){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;}
function trueRange(c:StrategyCandle,p:StrategyCandle){return Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));}
function atr(cs:StrategyCandle[]){const x=cs.slice(-15);return x.length>1?average(x.slice(1).map((c,i)=>trueRange(c,x[i]))):0;}
function arrays(cs:StrategyCandle[],minStrength=65):AmdArray[]{
 const out:AmdArray[]=[];
 for(let i=2;i<cs.length;i++){
  const a=cs[i-2],b=cs[i-1],c=cs[i],vol=average(cs.slice(Math.max(0,i-10),i).map(x=>x.volume)),vRatio=vol?b.volume/vol:0,rangeB=b.high-b.low;
  if(c.low>a.high){const strength=Math.min(100,Math.round(35+Math.min(35,rangeB/Math.max(atr(cs),1e-9)*20)+Math.min(30,vRatio*15)));out.push({kind:'fvg',side:'bullish',low:a.high,high:c.low,mid:(a.high+c.low)/2,strength,formedAt:b.closeTime});}
  if(c.high<a.low){const strength=Math.min(100,Math.round(35+Math.min(35,rangeB/Math.max(atr(cs),1e-9)*20)+Math.min(30,vRatio*15)));out.push({kind:'fvg',side:'bearish',low:c.high,high:a.low,mid:(c.high+a.low)/2,strength,formedAt:b.closeTime});}
  const body=Math.abs(b.close-b.open),aTR=atr(cs);
  if(aTR>0&&body>=aTR*.8&&vRatio>=1.15){const prior=cs[i-2];if(b.close>b.open&&prior.close<prior.open)out.push({kind:'order-block',side:'bullish',low:prior.low,high:prior.high,mid:(prior.low+prior.high)/2,strength:Math.min(100,Math.round(50+Math.min(25,body/aTR*15)+Math.min(25,vRatio*10))),formedAt:b.closeTime});if(b.close<b.open&&prior.close>prior.open)out.push({kind:'order-block',side:'bearish',low:prior.low,high:prior.high,mid:(prior.low+prior.high)/2,strength:Math.min(100,Math.round(50+Math.min(25,body/aTR*15)+Math.min(25,vRatio*10))),formedAt:b.closeTime});}
 }
 return out.filter(x=>x.strength>=minStrength);
}
function empty(time:number,tz:string,phase:AmdPhase,date:string,clock:string,reason:string):AmdAssessment{return {phase,sessionDate:date,timezone:tz,localTime:clock,entryAllowed:false,qualified:false,direction:'neutral',reason:[reason],accumulationRange:{high:null,low:null},manipulationRange:{high:null,low:null},sweeps:{high:false,low:false},structure:{cisd:'neutral',mss:'neutral',confirmed:'neutral'},pdArrays:[],activeArray:null,entryZone:null};}
export function analyseAmdSession(candles:StrategyCandle[],now=Date.now(),timezone=DEFAULT_AMD_TIMEZONE,options:{sweepSensitivityBps?:number;minArrayStrength?:number}={}):AmdAssessment{
 try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{return empty(now,timezone,'inactive','','','Invalid AMD session timezone');}
 const local=localParts(now,timezone),minute=local.hour*60+local.minute;
 const phase:AmdPhase=minute>=180&&minute<360?'accumulation':minute>=360&&minute<540?'manipulation':minute>=540&&minute<720?'distribution':'inactive';
 if(phase==='inactive')return empty(now,timezone,phase,local.date,local.clock,'Outside configured 03:00–12:00 AMD session');
 const same=candles.filter(c=>c.closeTime<=now&&localParts(c.closeTime,timezone).date===local.date);
 const phaseCandles=(start:number,end:number)=>same.filter(c=>{const t=localParts(c.closeTime,timezone),m=t.hour*60+t.minute;return m>=start&&m<end;});
 const accumulation=phaseCandles(180,360),manipulation=phaseCandles(360,540),distribution=phaseCandles(540,720);
 const ar=range(accumulation),mr=range(manipulation),reasons:string[]=[];
 if(phase==='accumulation')reasons.push('Accumulation phase: entries are strictly forbidden');
 if(phase==='manipulation')reasons.push('Manipulation phase: entries are strictly forbidden');
 if(phase==='distribution'&&manipulation.length<6)reasons.push('Insufficient completed manipulation-phase candles to establish the range');
 const last=distribution.at(-1),history=[...manipulation,...distribution];
 const sensitivity=Math.max(0,Math.min(50,options.sweepSensitivityBps??0))/10000;\n const aTR=atr(history),sweptHigh=mr.high!==null&&distribution.some(c=>c.high>mr.high!*(1+sensitivity)&&c.close<mr.high!),sweptLow=mr.low!==null&&distribution.some(c=>c.low<mr.low!*(1-sensitivity)&&c.close>mr.low!);
 let cisd:AmdDirection='neutral',mss:AmdDirection='neutral';
 if(last&&manipulation.length>=2){
  const bearish=manipulation.slice().reverse().find(c=>c.close<c.open),bullish=manipulation.slice().reverse().find(c=>c.close>c.open);
  if(bearish&&last.close>bearish.open&&last.close>last.open&&aTR>0&&last.close-last.open>=aTR*.35)cisd='bullish';
  if(bullish&&last.close<bullish.open&&last.close<last.open&&aTR>0&&last.open-last.close>=aTR*.35)cisd='bearish';
  const prior=history.slice(0,-1).slice(-10);
  if(prior.length>=5&&aTR>0){const sh=Math.max(...prior.slice(0,-1).map(c=>c.high)),sl=Math.min(...prior.slice(0,-1).map(c=>c.low));if(last.close>sh&&last.close-last.open>=aTR*.35)mss='bullish';if(last.close<sl&&last.open-last.close>=aTR*.35)mss='bearish';}
 }
 const confirmed:AmdDirection=cisd!=='neutral'?cisd:mss;
 const pd=arrays(manipulation,Math.max(50,Math.min(100,options.minArrayStrength??65))),price=last?.close??null;
 const touched=price===null?[]:pd.filter(z=>z.side===confirmed&&z.strength>=65&&price>=z.low&&price<=z.high);
 const sweepSupports=(confirmed==='bullish'&&sweptLow)||(confirmed==='bearish'&&sweptHigh);
 const activeArray=touched.sort((a,b)=>b.strength-a.strength)[0]??null;
 const trigger=sweepSupports||!!activeArray;
 if(phase==='distribution'&&confirmed==='neutral')reasons.push('Distribution entry requires CISD or MSS confirmation');
 if(phase==='distribution'&&!sweepSupports&&!activeArray)reasons.push('No manipulation-range liquidity sweep or retest of a strong manipulation-phase PD Array');
 if(phase==='distribution'&&confirmed!=='neutral'&&!trigger)reasons.push('Structural confirmation has no qualifying sweep or PD Array trigger');
 const qualified=phase==='distribution'&&distribution.length>0&&manipulation.length>=6&&confirmed!=='neutral'&&trigger;
 if(qualified)reasons.push('AMD distribution conditions satisfied; continue independent strategy, execution-cost and capital-risk validation');
 const direction=qualified?confirmed:'neutral';
 return {phase,sessionDate:local.date,timezone,localTime:local.clock,entryAllowed:phase==='distribution'&&qualified,qualified,direction,reason:reasons,accumulationRange:ar,manipulationRange:mr,sweeps:{high:sweptHigh,low:sweptLow},structure:{cisd,mss,confirmed},pdArrays:pd,activeArray,entryZone:activeArray?{low:activeArray.low,high:activeArray.high,mid:activeArray.mid}:null};
}
