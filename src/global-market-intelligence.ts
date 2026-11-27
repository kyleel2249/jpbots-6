export type GlobalAssetClass='crypto-spot'|'crypto-perpetual'|'forex-reference'|'equity'|'index'|'commodity'|'dex-pool'|'onchain-network';
export type GlobalInstrument={id:string;symbol:string;name:string;assetClass:GlobalAssetClass;venue:string;chain?:string;quote?:string;price?:number;change24hPct?:number;volume24hUsd?:number;liquidityUsd?:number;tvlUsd?:number;observedAt:number;source:string;tradable:boolean;metadata?:Record<string,unknown>};
export type Candle={openTime:number;open:number;high:number;low:number;close:number;volume:number;closeTime?:number};
export type PatternSignal={name:string;direction:'bullish'|'bearish'|'neutral';strength:number;detail:string};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
export function ema(values:number[],period:number):number|null{if(values.length<period)return null;const k=2/(period+1);let value=mean(values.slice(0,period))!;for(const x of values.slice(period))value=x*k+value*(1-k);return value;}
export function rsi(values:number[],period=14):number|null{if(values.length<=period)return null;let gain=0,loss=0;for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];if(d>0)gain+=d;else loss-=d;}if(loss===0)return 100;return 100-100/(1+(gain/period)/(loss/period));}
export function analyseMarketChart(candles:Candle[]):{trend:'bullish'|'bearish'|'sideways'|'unknown';ema9:number|null;ema21:number|null;rsi14:number|null;atrPct:number|null;volumeRatio:number|null;patterns:PatternSignal[];fairValueGaps:Array<{side:'bullish'|'bearish';low:number;high:number;mid:number}>;support:number|null;resistance:number|null;lastPrice:number|null;multiTimeframeAligned?:boolean;timeframes?:Record<string,unknown>}{
 const valid=candles.filter(c=>[c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.low>0&&c.high>=c.low&&c.close>0);
 const closes=valid.map(c=>c.close),last=valid.at(-1),fast=ema(closes,9),slow=ema(closes,21),momentum=rsi(closes);
 const trend=fast===null||slow===null?'unknown':Math.abs(fast-slow)/slow<.0008?'sideways':fast>slow?'bullish':'bearish';
 const ranges=valid.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-valid[i].close),Math.abs(c.low-valid[i].close)));
 const atr=mean(ranges.slice(-14)),atrPct=atr&&last?atr/last.close*100:null;
 const recentVol=mean(valid.slice(-5).map(c=>c.volume)),baseVol=mean(valid.slice(-30,-5).map(c=>c.volume)),volumeRatio=recentVol&&baseVol?recentVol/baseVol:null;
 const patterns:PatternSignal[]=[];
 if(valid.length>=2){const p=valid.at(-2)!,c=last!;if(c.close>c.open&&p.close<p.open&&c.close>=p.open&&c.open<=p.close)patterns.push({name:'Bullish engulfing',direction:'bullish',strength:72,detail:'Latest body engulfs prior bearish body'});if(c.close<c.open&&p.close>p.open&&c.open>=p.close&&c.close<=p.open)patterns.push({name:'Bearish engulfing',direction:'bearish',strength:72,detail:'Latest body engulfs prior bullish body'});const body=Math.abs(c.close-c.open),lower=Math.min(c.open,c.close)-c.low,upper=c.high-Math.max(c.open,c.close);if(lower>body*2&&upper<body)patterns.push({name:'Bullish rejection wick',direction:'bullish',strength:58,detail:'Long lower wick with limited upper rejection'});if(upper>body*2&&lower<body)patterns.push({name:'Bearish rejection wick',direction:'bearish',strength:58,detail:'Long upper wick with limited lower rejection'});}
 const fairValueGaps:Array<{side:'bullish'|'bearish';low:number;high:number;mid:number}>=[];
 for(let i=Math.max(2,valid.length-30);i<valid.length;i++){const a=valid[i-2],c=valid[i];if(c.low>a.high)fairValueGaps.push({side:'bullish',low:a.high,high:c.low,mid:(a.high+c.low)/2});else if(c.high<a.low)fairValueGaps.push({side:'bearish',low:c.high,high:a.low,mid:(c.high+a.low)/2});}
 const range=valid.slice(-30),support=range.length?Math.min(...range.map(c=>c.low)):null,resistance=range.length?Math.max(...range.map(c=>c.high)):null;
 if(volumeRatio!==null&&volumeRatio>=1.8)patterns.push({name:'Volume expansion',direction:last&&last.close>last.open?'bullish':last&&last.close<last.open?'bearish':'neutral',strength:Math.min(90,50+volumeRatio*10),detail:'Recent five-candle volume is '+volumeRatio.toFixed(2)+'× the preceding baseline'});
 return {trend,ema9:fast,ema21:slow,rsi14:momentum,atrPct,volumeRatio,patterns,fairValueGaps,support,resistance,lastPrice:last?.close??null};
}
export function scoreGlobalOpportunity(input:{change24hPct?:number;volume24hUsd?:number;chart?:ReturnType<typeof analyseMarketChart>;liquidityUsd?:number}):{score:number;direction:'bullish'|'bearish'|'neutral';reasons:string[]}{
 const c=input.chart,reasons:string[]=[];let score=0,direction:'bullish'|'bearish'|'neutral'='neutral';
 if(c?.trend==='bullish'){score+=18;direction='bullish';reasons.push('EMA trend bullish');}else if(c?.trend==='bearish'){score+=18;direction='bearish';reasons.push('EMA trend bearish');}
 if(c?.rsi14!==null&&c?.rsi14!==undefined){if(c.rsi14>52&&c.rsi14<70&&direction==='bullish')score+=12;else if(c.rsi14<48&&c.rsi14>30&&direction==='bearish')score+=12;else if(c.rsi14>=70||c.rsi14<=30)reasons.push('RSI at an extreme; chase risk');}
 if(c?.patterns.some(p=>p.strength>=65&&p.direction===direction))score+=15;
 if(c?.multiTimeframeAligned===true){score+=10;reasons.push('5m and 1h trends aligned');}else if(c?.multiTimeframeAligned===false)reasons.push('5m and 1h trends disagree');
 if(c?.volumeRatio&&c.volumeRatio>=1.5){score+=10;reasons.push('Volume expansion confirmed');}
 if(Number.isFinite(input.change24hPct)){const move=Math.abs(input.change24hPct!);if(move>=2&&move<=12)score+=8;else if(move>20)reasons.push('Extreme 24h move; volatility risk');}
 if((input.liquidityUsd??0)>1_000_000)score+=10;else if(input.liquidityUsd!==undefined)reasons.push('Thin or unverified liquidity');
 return {score:Math.min(100,score),direction,reasons};
}
export function rankGlobalInstruments(rows:GlobalInstrument[]):GlobalInstrument[]{return [...rows].sort((a,b)=>(b.volume24hUsd??b.liquidityUsd??0)-(a.volume24hUsd??a.liquidityUsd??0));}
