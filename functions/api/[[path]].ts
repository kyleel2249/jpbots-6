// Cloudflare Pages Service Binding proxy.
// OPERATOR_API_TOKEN must be configured as a Pages secret as well as a Worker secret.
// Never accept credentials supplied by the browser; inject the Pages secret server-side.
type PagesEnv={API_WORKER?:{fetch(request:Request):Promise<Response>};OPERATOR_API_TOKEN?:string};
type PagesContext={request:Request;env:PagesEnv};
const protectedPath=(pathname:string)=>pathname.startsWith('/api/amd/')||pathname==='/api/intelligence/advanced'||pathname==='/api/intelligence/predictive'||pathname==='/api/intelligence/replay'||pathname==='/api/intelligence/recovery'||pathname==='/api/intelligence/liquidations/ingest'||pathname==='/api/institutional/strategy/run'||pathname==='/api/agents/analyse'||pathname==='/api/operator/status';
export const onRequest=async(context:PagesContext):Promise<Response>=>{
 const {request,env}=context,binding=env.API_WORKER;
 if(!binding)return new Response(JSON.stringify({ok:false,error:'Backend service binding API_WORKER is not configured',code:'BACKEND_BINDING_MISSING'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const target=new URL(request.url);
 if(target.pathname==='/api/health')target.pathname='/health';
 const headers=new Headers(request.headers);
 // Browser-provided Authorization is never trusted or forwarded.
 headers.delete('authorization');
 if(protectedPath(target.pathname)){
  if(!env.OPERATOR_API_TOKEN)return new Response(JSON.stringify({ok:false,error:'OPERATOR_API_TOKEN is missing from Cloudflare Pages secrets. Configure the same value used by the backend Worker.',code:'PAGES_OPERATOR_SECRET_MISSING'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
  headers.set('authorization','Bearer '+env.OPERATOR_API_TOKEN);
 }
 headers.set('x-requested-with','jp-bots-6-pages-proxy');
 const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
 const forwarded=new Request(target.toString(),{method:request.method,headers,body,redirect:'manual'});
 try{return await binding.fetch(forwarded);}catch{return new Response(JSON.stringify({ok:false,error:'Backend Worker service binding request failed',code:'BACKEND_BINDING_UNAVAILABLE'}),{status:502,headers:{'content-type':'application/json','cache-control':'no-store'}});}
};
