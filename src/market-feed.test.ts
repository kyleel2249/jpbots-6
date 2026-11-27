import {describe,it,expect,vi} from 'vitest';
import {fetchMarketTickers} from './market-feed';

const good=(price='100')=>new Response(JSON.stringify({lastPrice:price,priceChangePercent:'1.5',quoteVolume:'12345'}),{status:200});
describe('market feed provider isolation',()=>{
  it('returns healthy tickers when every symbol responds',async()=>{
    const result=await fetchMarketTickers(['BTCUSDT','ETHUSDT'],'https://data.example',vi.fn(async()=>good()));
    expect(result.providerStatus).toBe('online');
    expect(result.returned).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
  it('preserves successful symbols when one upstream request fails',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('ETHUSDT')?new Response('rate limited',{status:429}):good());
    const result=await fetchMarketTickers(['BTCUSDT','ETHUSDT'],'https://data.example',fetcher);
    expect(result.providerStatus).toBe('degraded');
    expect(result.tickers.map(x=>x.symbol)).toEqual(['BTCUSDT']);
    expect(result.errors[0]).toMatchObject({symbol:'ETHUSDT',code:'UPSTREAM_HTTP_429'});
  });
  it('reports provider offline, not backend failure, when all upstream calls fail',async()=>{
    const result=await fetchMarketTickers(['BTCUSDT'],'https://data.example',vi.fn(async()=>new Response('down',{status:503})));
    expect(result.ok).toBe(false);
    expect(result.providerStatus).toBe('offline');
    expect(result.errors[0].code).toBe('UPSTREAM_HTTP_503');
  });
  it('rejects invalid ticker fields per symbol without rejecting the whole feed',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('BTCUSDT')?good('NaN'):good());
    const result=await fetchMarketTickers(['BTCUSDT','SOLUSDT'],'https://data.example',fetcher);
    expect(result.providerStatus).toBe('degraded');
    expect(result.tickers.map(x=>x.symbol)).toEqual(['SOLUSDT']);
    expect(result.errors[0].code).toBe('INVALID_TICKER');
  });
  it('normalises network failures into provider diagnostics',async()=>{
    const result=await fetchMarketTickers(['BTCUSDT'],'https://data.example',vi.fn(async()=>{throw new Error('socket failure');}));
    expect(result.providerStatus).toBe('offline');
    expect(result.errors[0].code).toBe('UPSTREAM_NETWORK_ERROR');
  });
});
