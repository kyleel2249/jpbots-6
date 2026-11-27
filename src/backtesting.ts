export type BacktestCandle={openTime:number;closeTime:number;open:number;high:number;low:number;close:number;volume:number};
export type EmaBacktestConfig={fastPeriod:number;slowPeriod:number;feeBps:number;slippageBps:number;initialEquity?:number};
type BacktestTrade={side:'long'|'short';entry:number;exit:number;grossPct:number;costPct:number;netPct:number;netPnl:number;entryTime:number;exitTime:number};
const emaSeries=(values:number[],period:number):(number|null)[]=>{
 const result:(number|null)[]=Array(values.length).fill(null);
 if(values.length<period)return result;
 const alpha=2/(period+1);
 let current=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
 result[period-1]=current;
 for(let i=period;i<values.length;i++){current=values[i]*alpha+current*(1-alpha);result[i]=current;}
 return result;
};
export function runEmaBacktest(candles:BacktestCandle[],config:EmaBacktestConfig){
 const errors:string[]=[];
 if(!Number.isInteger(config.fastPeriod)||config.fastPeriod<2)errors.push('fast period must be an integer >= 2');
 if(!Number.isInteger(config.slowPeriod)||config.slowPeriod<=config.fastPeriod)errors.push('slow period must exceed fast period');
 if(!Number.isFinite(config.feeBps)||config.feeBps<0||config.feeBps>100)errors.push('fee bps outside 0..100');
 if(!Number.isFinite(config.slippageBps)||config.slippageBps<0||config.slippageBps>100)errors.push('slippage bps outside 0..100');
 if(candles.length<Math.max(config.slowPeriod*2,50))errors.push('insufficient historical candles');
 if(config.initialEquity!==undefined&&(!Number.isFinite(config.initialEquity)||config.initialEquity<=0))errors.push('initial equity must be positive');
 if(candles.some((c,i)=>![c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.open<=0||c.close<=0||c.high<c.low||(i>0&&c.openTime<=candles[i-1].openTime)))errors.push('invalid or unordered historical candle');
 if(errors.length)return {valid:false,errors,trades:[] as BacktestTrade[],metrics:null as null};
 const closes=candles.map(c=>c.close),fast=emaSeries(closes,config.fastPeriod),slow=emaSeries(closes,config.slowPeriod);
 const roundTripCostPct=2*(config.feeBps+config.slippageBps)/100;
 const initialEquity=config.initialEquity??10000;
 let side:-1|0|1=0,entry=0,entryIndex=0,equity=initialEquity,peak=initialEquity,maxDrawdown=0,netProfit=0,grossWins=0,grossLoss=0;
 const trades:BacktestTrade[]=[];
 const closePosition=(price:number,time:number)=>{
  if(!side)return;
  const grossPct=side*(price-entry)/entry*100,netPct=grossPct-roundTripCostPct,netPnl=equity*netPct/100;
  trades.push({side:side===1?'long':'short',entry,exit:price,grossPct,costPct:roundTripCostPct,netPct,netPnl,entryTime:candles[entryIndex].openTime,exitTime:time});
  equity+=netPnl;netProfit+=netPnl;
  if(netPnl>0)grossWins+=netPnl;else grossLoss+=Math.abs(netPnl);
  peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-equity)/peak*100:100);side=0;
 };
 for(let i=config.slowPeriod;i<candles.length-1;i++){
  if(fast[i]===null||slow[i]===null||fast[i-1]===null||slow[i-1]===null)continue;
  const previous=(fast[i-1] as number)-(slow[i-1] as number),current=(fast[i] as number)-(slow[i] as number);
  const next:-1|0|1=previous<=0&&current>0?1:previous>=0&&current<0?-1:0;
  if(next&&next!==side){const fill=candles[i+1];closePosition(fill.open,fill.openTime);side=next;entry=fill.open;entryIndex=i+1;}
 }
 const last=candles[candles.length-1];closePosition(last.close,last.closeTime);
 const wins=trades.filter(t=>t.netPnl>0).length,losses=trades.filter(t=>t.netPnl<0).length;
 return {valid:true,errors:[],trades,metrics:{tradeCount:trades.length,wins,losses,winRatePct:trades.length?wins/trades.length*100:0,netPnl:netProfit,netReturnPct:(equity-initialEquity)/initialEquity*100,profitFactor:grossLoss?grossWins/grossLoss:grossWins>0?null:0,expectancy:trades.length?netProfit/trades.length:0,maxDrawdownPct:maxDrawdown,feeBps:config.feeBps,slippageBps:config.slippageBps,initialEquity,finalEquity:equity}};
}
