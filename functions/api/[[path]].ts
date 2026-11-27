// Cloudflare Pages Service Binding proxy to the separately deployed backend Worker.
export const onRequest = async (context: any): Promise<Response> => {
  const binding = context.env?.API_WORKER;
  if (!binding) return new Response(JSON.stringify({error:'Backend service binding API_WORKER is not configured'}),{status:503,headers:{'content-type':'application/json'}});
  const target = new URL(context.request.url);
  if (target.pathname === '/api/health') target.pathname = '/health';
  return binding.fetch(new Request(target.toString(), context.request));
};
