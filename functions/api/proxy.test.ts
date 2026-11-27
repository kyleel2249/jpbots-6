import {describe,it,expect,vi} from 'vitest';
import {onRequest} from './[[path]].ts';
function context(url:string,env:any,headers?:Record<string,string>,method='GET',body?:string){return {request:new Request(url,{method,headers,body:method==='GET'?undefined:body}),env} as any;}
describe('Cloudflare Pages API proxy',()=>{
 it('injects the Pages secret for protected routes and overwrites browser credentials',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  const response=await onRequest(context('https://app.example/api/amd/replay?symbol=BTCUSDT',{API_WORKER:binding,OPERATOR_API_TOKEN:'server-secret'},{authorization:'Bearer attacker','content-type':'application/json'},'POST','{}'));
  expect(response.status).toBe(200);expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');expect(captured?.url).toContain('/api/amd/replay?symbol=BTCUSDT');expect(captured?.headers.get('authorization')).not.toContain('attacker');
 });
 it('protects predictive intelligence and liquidation ingestion routes',async()=>{let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};for(const path of ['/api/intelligence/predictive','/api/intelligence/liquidations/ingest']){await onRequest(context('https://app.example'+path,{API_WORKER:binding,OPERATOR_API_TOKEN:'server-secret'},undefined,'POST','{}'));expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');}});
 it('fails closed when the Pages secret is missing',async()=>{
  const binding={fetch:vi.fn()};const response=await onRequest(context('https://app.example/api/amd/replay',{API_WORKER:binding}));
  expect(response.status).toBe(503);expect((await response.json() as any).code).toBe('PAGES_OPERATOR_SECRET_MISSING');expect(binding.fetch).not.toHaveBeenCalled();
 });
 it('does not forward browser Authorization on public endpoints',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  await onRequest(context('https://app.example/api/market/tickers',{API_WORKER:binding},{authorization:'Bearer attacker'}));
  expect(captured?.headers.has('authorization')).toBe(false);
 });
 it('reports a missing backend binding distinctly',async()=>{
  const response=await onRequest(context('https://app.example/api/market/tickers',{}));
  expect(response.status).toBe(503);expect((await response.json() as any).code).toBe('BACKEND_BINDING_MISSING');
 });
 it('maps the Pages health URL to the Worker health route',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  await onRequest(context('https://app.example/api/health',{API_WORKER:binding}));
  expect(new URL(captured!.url).pathname).toBe('/health');
 });
});
