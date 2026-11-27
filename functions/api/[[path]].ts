// Cloudflare Pages API proxy. Prefer the private Service Binding; fall back to the
// deployed Worker URL so a missing Pages binding does not take the entire app offline.
// Protected routes always receive the server-side Pages secret, never browser credentials.
type WorkerBinding={fetch(request:Request):Promise<Response>};
type PagesEnv={API_WORKER?:WorkerBinding;OPERATOR_API_TOKEN?:string;BACKEND_WORKER_URL?:string};
type PagesContext={request:Request;env:PagesEnv};
const DEFAULT_BACKEND_URL='https://jp-bots-6-backend.cintexatechnologies.workers.dev';
const protectedPath=(pathname:string)=>pathname.startsWith('/api/amd/')||pathname==='/api/intelligence/advanced'||pathname==='/api/intelligence/predictive'||pathname==='/api/intelligence/replay'||pathname==='/api/intelligence/recovery'||pathname==='/api/intelligence/liquidations/ingest'||pathname==='/api/institutional/strategy/run'||pathname==='/api/agents/analyse'||pathname==='/api/agents/control'||pathname==='/api/agents/control-all'||pathname==='/api/operator/status'||pathname==='/api/global-market/scan'||pathname==='/api/adaptive-trading/evaluate'||pathname==='/api/adaptive-trading/run';
export const onRequest=async(context:PagesContext):Promise<Response>=>{
 const {request,env}=context,target=new URL(request.url);
 if(target.pathname==='/api/health')target.pathname='/health';
 const headers=new Headers(request.headers);
 headers.delete('authorization');
 if(protectedPath(target.pathname)){
  if(!env.OPERATOR_API_TOKEN)return new Response(JSON.stringify({ok:false,error:'OPERATOR_API_TOKEN is missing from Cloudflare Pages secrets. Configure the same value used by the backend Worker.',code:'PAGES_OPERATOR_SECRET_MISSING'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
  headers.set('authorization','Bearer '+env.OPERATOR_API_TOKEN);
 }
 headers.set('x-requested-with','jp-bots-6-pages-proxy');
 const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
 try{
  if(env.API_WORKER){
   const forwarded=new Request(target.toString(),{method:request.method,headers,body,redirect:'manual'});
   return await env.API_WORKER.fetch(forwarded);
  }
  const backendBase=(env.BACKEND_WORKER_URL||DEFAULT_BACKEND_URL).replace(/\/$/,'');
  const backendUrl=new URL(target.pathname+target.search,backendBase);
  const forwarded=new Request(backendUrl.toString(),{method:request.method,headers,body,redirect:'manual'});
  const response=await fetch(forwarded);
  const responseHeaders=new Headers(response.headers);
  responseHeaders.set('x-jpbots-backend-transport','direct-worker-fallback');
  responseHeaders.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:responseHeaders});
 }catch(error){
  return new Response(JSON.stringify({ok:false,error:'Backend Worker request failed: '+(error instanceof Error?error.message:'unknown network error'),code:'BACKEND_BINDING_AND_FALLBACK_UNAVAILABLE'}),{status:502,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
