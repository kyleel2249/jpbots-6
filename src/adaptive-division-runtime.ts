import type { MarketEvidence, Direction } from './adaptive-trading';
import type { Candle } from './global-market-intelligence';
import type { OrderBookSnapshot } from './shared-services';

export interface DivisionMarketInput {
  symbol:string; assetClass:string; candles1m:Candle[]; candles5m:Candle[]; candles1h:Candle[];
  book:OrderBookSnapshot; observedAt:number; sessionEligible?:boolean; feeBps?:number;
}
const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const direction=(values:number[]):Direction=>{
  if(values.length<22)return 'neutral';
  const fast=mean(values.slice(-9)),slow=mean(values.slice(-21));
  if(!(slow>0))return 'neutral';
  const delta=(fast-slow)/slow;
  return delta>0.00015?'long':delta< -0.00015?'short':'neutral';
};
const imbalance=(book:OrderBookSnapshot)=>{
  const bid=book.bids.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0);
  const ask=book.asks.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0);
  return bid+ask>0?Math.max(-1,Math.min(1,(bid-ask)/(bid+ask))):0;
};
const atrPct=(candles:Candle[])=>{
  const rows=candles.slice(-15);
  if(rows.length<3)return 0;
  const tr=rows.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-rows[i].close),Math.abs(c.low-rows[i].close)));
  return mean(tr)/rows.at(-1)!.close*100;
};
const volumeRatio=(rows:Candle[])=>{const baseline=mean(rows.slice(-30,-5).map(c=>c.volume)),recent=mean(rows.slice(-5).map(c=>c.volume));return baseline>0?recent/baseline:0;};
const structureShift=(rows:Candle[],side:'long'|'short')=>rows.length>=12?(side==='long'?rows.at(-1)!.close>Math.max(...rows.slice(-12,-1).map(c=>c.high)):rows.at(-1)!.close<Math.min(...rows.slice(-12,-1).map(c=>c.low))):false;
const vwap=(candles:Candle[])=>{
  const rows=candles.slice(-30),volume=rows.reduce((s,c)=>s+c.volume,0);
  return volume>0?rows.reduce((s,c)=>s+((c.high+c.low+c.close)/3)*c.volume,0)/volume:rows.at(-1)?.close??0;
};
const hasBullishFvg=(rows:Candle[])=>rows.slice(-20).some((c,i,a)=>i>=2&&c.low>a[i-2].high);
const hasBearishFvg=(rows:Candle[])=>rows.slice(-20).some((c,i,a)=>i>=2&&c.high<a[i-2].low);
const sweep=(rows:Candle[],side:'long'|'short')=>{
  if(rows.length<12)return false;
  const recent=rows.slice(-12,-1),last=rows.at(-1)!;
  return side==='long'?last.low<Math.min(...recent.map(x=>x.low))&&last.close>Math.min(...recent.map(x=>x.low)):last.high>Math.max(...recent.map(x=>x.high))&&last.close<Math.max(...recent.map(x=>x.high));
};
export function buildDivisionMarketEvidence(input:DivisionMarketInput):MarketEvidence{
  const now=input.observedAt,book=input.book,mid=book.mid;
  if(!Number.isFinite(now)||!Number.isFinite(mid)||mid<=0||!Number.isFinite(book.timestamp)||book.timestamp>now||!book.bids.length||!book.asks.length)throw new Error('A valid, timestamped two-sided order book is required');
  const valid=(rows:Candle[])=>rows.filter(c=>(c.closeTime===undefined||c.closeTime<now)&&[c.openTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.low>0&&c.high>=c.low&&c.close>0&&c.volume>=0).sort((a,b)=>a.openTime-b.openTime);
  const one=valid(input.candles1m),five=valid(input.candles5m),hour=valid(input.candles1h);
  if(!Number.isFinite(input.feeBps??10)||(input.feeBps??10)<0)throw new Error('Invalid paper fee assumption');
  if(book.bids[0].price<=0||book.asks[0].price<=book.bids[0].price)throw new Error('Crossed or invalid order book');
  if(one.length<30||five.length<30||hour.length<22)throw new Error('Insufficient closed candles for independent division evidence');
  const scalpDirection=direction(one.map(c=>c.close)),dayDirection=direction(five.map(c=>c.close))===direction(hour.map(c=>c.close))?direction(five.map(c=>c.close)):'neutral';
  const bid=book.bids[0].price,ask=book.asks[0].price,spreadBps=(ask-bid)/mid*10000;
  const depthUsd=book.bids.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0)+book.asks.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0);
  const feeBps=input.feeBps??10;
  const scalpSide=scalpDirection==='short'?'short':'long',daySide=dayDirection==='short'?'short':'long';
  const scalpFvg=scalpSide==='short'?hasBearishFvg(one):hasBullishFvg(one),dayFvg=daySide==='short'?hasBearishFvg(five):hasBullishFvg(five);
  const scalpSweep=sweep(one,scalpSide),daySweep=sweep(five,daySide);
  const scalpMss=structureShift(one,scalpSide),dayMss=structureShift(five,daySide);
  const scalpVwapAligned=scalpDirection==='long'?mid>=vwap(one):scalpDirection==='short'?mid<=vwap(one):false;
  const dayVwapAligned=dayDirection==='long'?mid>=vwap(five):dayDirection==='short'?mid<=vwap(five):false;
  const scalpVolumeRatio=volumeRatio(one),dayVolumeRatio=volumeRatio(five),scalpVolatility=atrPct(one),dayVolatility=atrPct(five);
  const dayImbalance=imbalance(book),scalpImbalance=imbalance(book);
  const vwapAligned=dayDirection==='long'?mid>=vwap(five):dayDirection==='short'?mid<=vwap(five):false;
  return {
    symbol:input.symbol,assetClass:input.assetClass,price:mid,direction:dayDirection,
    scalpingDirection:scalpDirection,dayTradingDirection:dayDirection,
    scalpingOrderBookImbalance:scalpImbalance,dayTradingOrderBookImbalance:dayImbalance,
    dayTradingTrendAlignment:dayDirection==='long'?1:dayDirection==='short'?-1:0,
    observedAt:now,spreadBps,estimatedRoundTripCostBps:spreadBps+feeBps*2+2,
    volatilityPct:scalpVolatility,volumeRatio:scalpVolumeRatio,scalpingVolumeRatio:scalpVolumeRatio,dayTradingVolumeRatio:dayVolumeRatio,
    scalpingVolatilityPct:scalpVolatility,dayTradingVolatilityPct:dayVolatility,
    scalpingFvg:scalpFvg,dayTradingFvg:dayFvg,scalpingLiquiditySweep:scalpSweep,dayTradingLiquiditySweep:daySweep,
    scalpingMarketStructureShift:scalpMss,dayTradingMarketStructureShift:dayMss,scalpingVwapAligned,dayTradingVwapAligned:dayVwapAligned,
    trendAlignment:scalpDirection==='long'?1:scalpDirection==='short'?-1:0,
    orderBookImbalance:scalpImbalance,liquidityUsd:depthUsd,atrPct:dayVolatility,scalpingAtrPct:scalpVolatility,dayTradingAtrPct:dayVolatility,
    dataAgeMs:Math.max(0,now-book.timestamp),scalpingDataAgeMs:book.trades?.length?Math.max(0,now-Math.max(...book.trades.map(t=>t.timestamp))):Number.MAX_SAFE_INTEGER,dayTradingDataAgeMs:Math.max(0,now-book.timestamp),sessionEligible:input.sessionEligible??true,
    fvg:dayFvg||scalpFvg,liquiditySweep:daySweep||scalpSweep,marketStructureShift:dayMss,vwapAligned:dayVwapAligned,fundingExtreme:false
  };
}
export type LongPaperLevels={valid:false;reason:string}|{valid:true;entry:number;stop:number;target:number;stopDistancePct:number;netRewardRisk:number};
export function buildLongPaperLevels(evidence:MarketEvidence,division:'scalping'|'day-trading'):LongPaperLevels{
  if(evidence.direction!=='long'&&division==='day-trading')return {valid:false,reason:'The spot-only division paper executor cannot open short positions'};
  if(evidence.scalpingDirection!=='long'&&division==='scalping')return {valid:false,reason:'The spot-only division paper executor cannot open short positions'};
  const price=evidence.price,atr=price*(division==='scalping'?(evidence.scalpingAtrPct??evidence.atrPct):(evidence.dayTradingAtrPct??evidence.atrPct))/100;
  if(!(price>0&&atr>0))return {valid:false,reason:'ATR-based stop distance is unavailable'};
  const stopDistance=Math.max(atr*(division==='scalping'?0.8:1.5),price*0.001);
  const stop=price-stopDistance,target=price+stopDistance*(division==='scalping'?1.5:2);
  if(!(stop>0&&stop<price&&target>price))return {valid:false,reason:'Invalid stop/target geometry'};
  return {valid:true,entry:price,stop,target,stopDistancePct:stopDistance/price*100,netRewardRisk:division==='scalping'?1.5:2};
}
