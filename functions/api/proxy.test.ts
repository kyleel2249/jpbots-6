import {describe,it,expect,vi,afterEach} from 'vitest';
import {onRequest} from './[[path]].ts';
function context(url:string,env:any,headers?:Record<string,string>,method='GET',body?:string){return {request:new Request(url,{method,headers,body:method==='GET'?undefined:body}),env} as any;}
afterEach(()=>vi.unstubAllGlobals());
describe('Cloudflare Pages API proxy',()=>{
 it('injects the Pages secret for protected routes and overwrites browser credentials',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  const response=await onRequest(context('https://app.example/api/amd/replay?symbol=BTCUSDT',{API_WORKER:binding,OPERATOR_API_TOKEN:'server-secret'},{authorization:'Bearer attacker','content-type':'application/json'},'POST','{}'));
  expect(response.status).toBe(200);expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');expect(captured?.url).toContain('/api/amd/replay?symbol=BTCUSDT');expect(captured?.headers.get('authorization')).not.toContain('attacker');
 });
 it('protects predictive intelligence and liquidation ingestion routes',async()=>{let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};for(const path of ['/api/intelligence/predictive','/api/intelligence/liquidations/ingest','/api/global-market/scan','/api/adaptive-trading/evaluate','/api/adaptive-trading/run']){await onRequest(context('https://app.example'+path,{API_WORKER:binding,OPERATOR_API_TOKEN:'server-secret'},undefined,'POST','{}'));expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');}});
 it('protects bulk agent activation and deactivation routes',async()=>{let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};for(const enabled of [true,false]){await onRequest(context('https://app.example/api/agents/control-all',{API_WORKER:binding,OPERATOR_API_TOKEN:'server-secret'},{authorization:'Bearer attacker'},'POST',JSON.stringify({enabled})));expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');}});
 it('fails closed when the Pages secret is missing',async()=>{
  const binding={fetch:vi.fn()};const response=await onRequest(context('https://app.example/api/amd/replay',{API_WORKER:binding}));
  expect(response.status).toBe(503);expect((await response.json() as any).code).toBe('PAGES_OPERATOR_SECRET_MISSING');expect(binding.fetch).not.toHaveBeenCalled();
 });
 it('does not forward browser Authorization on public endpoints',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  await onRequest(context('https://app.example/api/market/tickers',{API_WORKER:binding},{authorization:'Bearer attacker'}));
  expect(captured?.headers.has('authorization')).toBe(false);
 });
 it('uses the direct Worker fallback when the Pages Service Binding is absent',async()=>{
  let captured:Request|undefined;const fetchMock=vi.fn(async(r:Request)=>{captured=r;return new Response('ok');});vi.stubGlobal('fetch',fetchMock);
  const response=await onRequest(context('https://app.example/api/paper/account?mode=paper',{BACKEND_WORKER_URL:'https://worker.example.workers.dev'}));
  expect(response.status).toBe(200);expect(captured?.url).toBe('https://worker.example.workers.dev/api/paper/account?mode=paper');expect(response.headers.get('x-jpbots-backend-transport')).toBe('direct-worker-fallback');
 });
 it('injects the server-side operator token in direct fallback mode',async()=>{
  let captured:Request|undefined;vi.stubGlobal('fetch',vi.fn(async(r:Request)=>{captured=r;return new Response('ok');}));
  await onRequest(context('https://app.example/api/operator/status',{OPERATOR_API_TOKEN:'server-secret',BACKEND_WORKER_URL:'https://worker.example.workers.dev'},{authorization:'Bearer attacker'}));
  expect(captured?.headers.get('authorization')).toBe('Bearer server-secret');
 });
 it('reports a fallback network failure distinctly',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('network unavailable');}));
  const response=await onRequest(context('https://app.example/api/market/tickers',{}));
  expect(response.status).toBe(502);expect((await response.json() as any).code).toBe('BACKEND_BINDING_AND_FALLBACK_UNAVAILABLE');
 });
 it('maps the Pages health URL to the Worker health route',async()=>{
  let captured:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{captured=r;return new Response('ok');})};
  await onRequest(context('https://app.example/api/health',{API_WORKER:binding}));
  expect(new URL(captured!.url).pathname).toBe('/health');
 });
});
