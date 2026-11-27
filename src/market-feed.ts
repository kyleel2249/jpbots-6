export type MarketTicker = {symbol:string;price:number;changePct:number;volume:number;observedAt:number;source:string};
export type MarketTickerResult = {ok:boolean;provider:string;providerStatus:'online'|'degraded'|'offline';source:string;observedAt:number;requested:number;returned:number;tickers:MarketTicker[];errors:{symbol:string;code:string;message:string}[]};

export async function fetchMarketTickers(
  symbols:string[],
  baseUrl:string,
  fetcher:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>=fetch
):Promise<MarketTickerResult>{
  const observedAt=Date.now();
  const settled=await Promise.all(symbols.map(async symbol=>{
    try{
      const response=await fetcher(baseUrl.replace(/\/$/,'')+'/api/v3/ticker/24hr?symbol='+encodeURIComponent(symbol),{headers:{accept:'application/json'}});
      if(!response.ok)return {error:{symbol,code:'UPSTREAM_HTTP_'+response.status,message:'Binance returned HTTP '+response.status}};
      let data:any;
      try{data=await response.json();}catch{return {error:{symbol,code:'INVALID_JSON',message:'Binance returned an unreadable response'}};}
      const price=Number(data?.lastPrice),changePct=Number(data?.priceChangePercent),volume=Number(data?.quoteVolume);
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(changePct)||!Number.isFinite(volume))return {error:{symbol,code:'INVALID_TICKER',message:'Binance returned incomplete or invalid ticker fields'}};
      return {ticker:{symbol,price,changePct,volume,observedAt,source:'Binance Spot REST'} as MarketTicker};
    }catch{return {error:{symbol,code:'UPSTREAM_NETWORK_ERROR',message:'Unable to reach Binance for this symbol'}};}
  }));
  const tickers=settled.flatMap(x=>'ticker' in x?[x.ticker]:[]);
  const errors=settled.flatMap(x=>'error' in x?[x.error]:[]);
  const providerStatus=errors.length===0?'online':tickers.length?'degraded':'offline';
  return {ok:tickers.length>0,provider:'Binance Spot REST',providerStatus,source:'Binance Spot REST',observedAt,requested:symbols.length,returned:tickers.length,tickers,errors};
}
