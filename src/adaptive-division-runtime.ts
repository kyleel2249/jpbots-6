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
  if(!Number.isFinite(mid)||mid<=0||!book.bids.length||!book.asks.length)throw new Error('A valid two-sided order book is required');
  const one=input.candles1m.filter(c=>c.closeTime===undefined||c.closeTime<now);
  const five=input.candles5m.filter(c=>c.closeTime===undefined||c.closeTime<now);
  const hour=input.candles1h.filter(c=>c.closeTime===undefined||c.closeTime<now);
  if(one.length<30||five.length<30||hour.length<22)throw new Error('Insufficient closed candles for independent division evidence');
  const scalpDirection=direction(one.map(c=>c.close)),dayDirection=direction(five.map(c=>c.close))===direction(hour.map(c=>c.close))?direction(five.map(c=>c.close)):'neutral';
  const bid=book.bids[0].price,ask=book.asks[0].price,spreadBps=(ask-bid)/mid*10000;
  const depthUsd=book.bids.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0)+book.asks.slice(0,20).reduce((s,l)=>s+l.price*l.quantity,0);
  const last=one.at(-1)!,baseline=mean(one.slice(-30,-5).map(c=>c.volume)),recent=mean(one.slice(-5).map(c=>c.volume));
  const feeBps=input.feeBps??10;
  const longFvg=hasBullishFvg(five),shortFvg=hasBearishFvg(five),dayFvg=dayDirection==='short'?shortFvg:longFvg;
  const daySweep=sweep(five,dayDirection==='short'?'short':'long');
  const scalpSweep=sweep(one,scalpDirection==='short'?'short':'long');
  const trend1=direction(five.map(c=>c.close)),trend2=direction(hour.map(c=>c.close));
  const dayImbalance=imbalance(book),scalpImbalance=imbalance(book);
  const vwapAligned=dayDirection==='long'?mid>=vwap(five):dayDirection==='short'?mid<=vwap(five):false;
  return {
    symbol:input.symbol,assetClass:input.assetClass,price:mid,direction:dayDirection,
    scalpingDirection:scalpDirection,dayTradingDirection:dayDirection,
    scalpingOrderBookImbalance:scalpImbalance,dayTradingOrderBookImbalance:dayImbalance,
    dayTradingTrendAlignment:dayDirection==='long'?1:dayDirection==='short'?-1:0,
    observedAt:now,spreadBps,estimatedRoundTripCostBps:spreadBps+feeBps*2+2,
    volatilityPct:atrPct(one),volumeRatio:baseline>0?recent/baseline:0,
    trendAlignment:scalpDirection==='long'?1:scalpDirection==='short'?-1:0,
    orderBookImbalance:scalpImbalance,liquidityUsd:depthUsd,atrPct:atrPct(five),
    dataAgeMs:0,sessionEligible:input.sessionEligible??true,
    fvg:dayFvg||longFvg||shortFvg,liquiditySweep:daySweep||scalpSweep,
    marketStructureShift:(dayDirection==='long'&&five.at(-1)!.close>Math.max(...five.slice(-12,-1).map(c=>c.high)))||(dayDirection==='short'&&five.at(-1)!.close<Math.min(...five.slice(-12,-1).map(c=>c.low))),
    vwapAligned,fundingExtreme:false
  };
}
export function buildLongPaperLevels(evidence:MarketEvidence,division:'scalping'|'day-trading'){
  if(evidence.direction!=='long'&&division==='day-trading')return {valid:false,reason:'The spot-only division paper executor cannot open short positions'};
  if(evidence.scalpingDirection!=='long'&&division==='scalping')return {valid:false,reason:'The spot-only division paper executor cannot open short positions'};
  const price=evidence.price,atr=price*evidence.atrPct/100;
  if(!(price>0&&atr>0))return {valid:false,reason:'ATR-based stop distance is unavailable'};
  const stopDistance=Math.max(atr*(division==='scalping'?0.8:1.5),price*0.001);
  const stop=price-stopDistance,target=price+stopDistance*(division==='scalping'?1.5:2);
  if(!(stop>0&&stop<price&&target>price))return {valid:false,reason:'Invalid stop/target geometry'};
  return {valid:true,entry:price,stop,target,stopDistancePct:stopDistance/price*100,netRewardRisk:division==='scalping'?1.5:2};
}
