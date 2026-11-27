import { allAgentRoles, departments, platformServices } from '../src/departments';
import { buildMarketReport, evaluateIntegratedOpportunity } from '../src/intelligence';
import { runEmaBacktest } from '../src/backtesting';
import type { Snapshot } from '../src/intelligence';
import { analyseOrderBook } from '../src/shared-services';
import type { Evidence, OrderBookSnapshot, CapitalState } from '../src/shared-services';

interface D1Result { success:boolean; results?:any[]; meta?:any }
interface D1Statement { bind(...values:any[]):D1Statement; run():Promise<D1Result>; all<T=any>():Promise<{results:T[]}>; first<T=any>():Promise<T|null> }
interface D1Database { prepare(sql:string):D1Statement; batch(statements:D1Statement[]):Promise<D1Result[]> }
interface DurableStorage { get<T=any>(key:string):Promise<T|undefined>; put(key:string,value:any):Promise<void>; setAlarm(time:number):Promise<void>; delete(key:string):Promise<boolean> }
interface DurableState { storage:DurableStorage; id:{toString():string} }
interface DurableId { toString():string }
interface DurableNamespace { idFromName(name:string):DurableId; get(id:DurableId):{fetch(input:Request|string,init?:RequestInit):Promise<Response>} }
interface Env { DB:D1Database; ORCHESTRATOR:DurableNamespace; BINANCE_BASE_URL?:string; DEXSCREENER_BASE_URL?:string; LIVE_TRADING_ENABLED?:string; OPERATOR_TOKEN?:string }
type Kline=[number,string,string,string,string,string,number,string,string,string,string,string];
type Task={id:string;kind:'market-scan';symbol:string;createdAt:number};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const cors=(response:Response)=>{const h=new Headers(response.headers);h.set('access-control-allow-origin','*');h.set('access-control-allow-methods','GET,POST,OPTIONS');h.set('access-control-allow-headers','content-type,authorization');return new Response(response.body,{status:response.status,headers:h});};
const uuid=()=>crypto.randomUUID();
const binance=(env:Env)=> (env.BINANCE_BASE_URL||'https://api.binance.com').replace(/\/$/,'');
const dexscreener=(env:Env)=>(env.DEXSCREENER_BASE_URL||'https://api.dexscreener.com').replace(/\/$/,'');
async function getJson<T>(url:string):Promise<T>{const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error('Provider returned HTTP '+response.status);return response.json() as Promise<T>;}
async function audit(env:Env,type:string,actor:string,payload:unknown){await env.DB.prepare('INSERT INTO audit_events(id,event_type,actor,created_at,payload_json) VALUES(?,?,?,?,?)').bind(uuid(),type,actor,Date.now(),JSON.stringify(payload)).run();}
function ema(values:number[],period:number){if(values.length<period)return null;const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;for(const x of values.slice(period))v=x*k+v*(1-k);return v;}
function rsi(values:number[],period=14){if(values.length<=period)return null;let gains=0,losses=0;for(let i=values.length-period;i<values.length;i++){const delta=values[i]-values[i-1];if(delta>0)gains+=delta;else losses-=delta;}if(losses===0)return 100;const rs=(gains/period)/(losses/period);return 100-100/(1+rs);}
async function getCapital(env:Env):Promise<CapitalState>{const row=await env.DB.prepare("SELECT * FROM portfolio_accounts WHERE account_id='primary'").first<any>();return {equity:row?.equity??0,peakEquity:row?.peak_equity??0,dailyLossPct:row?.daily_loss_pct??0,weeklyLossPct:row?.weekly_loss_pct??0,monthlyLossPct:row?.monthly_loss_pct??0,openPositions:row?.open_positions??0,correlatedExposurePct:row?.correlated_exposure_pct??0,leverage:row?.leverage??0,marginUtilisationPct:row?.margin_utilisation_pct??0,exchangeHealthy:true,dataFresh:true,accountReconciled:row?.reconciled===1};}
async function marketBundle(env:Env,symbol:string){
 const root=binance(env);
 const [raw,depth,trades]=await Promise.all([
  getJson<Kline[]>(root+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval=1m&limit=120'),
  getJson<{lastUpdateId:number;bids:[string,string][];asks:[string,string][]}>(root+'/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit=100'),
  getJson<{p:string;q:string;m:boolean;T:number}[]>(root+'/api/v3/aggTrades?symbol='+encodeURIComponent(symbol)+'&limit=100')
 ]);
 if(!raw.length||!depth.bids.length||!depth.asks.length)throw new Error('Provider returned incomplete candle or order-book data');
 const closes=raw.map(k=>Number(k[4]));
 if(closes.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Invalid candle prices received');
 const bidLevels=depth.bids.map(x=>({price:Number(x[0]),quantity:Number(x[1])})),askLevels=depth.asks.map(x=>({price:Number(x[0]),quantity:Number(x[1])}));
 const bestBid=bidLevels[0]?.price??0,bestAsk=askLevels[0]?.price??0,mid=(bestBid+bestAsk)/2;
 if(!(mid>0)||bestAsk<=bestBid)throw new Error('Invalid or crossed order book');
 const now=Date.now(),book:OrderBookSnapshot={symbol,timestamp:now,mid,bids:bidLevels,asks:askLevels,trades:trades.map(t=>({price:Number(t.p),quantity:Number(t.q),aggressor:t.m?'sell':'buy',timestamp:t.T}))};
 const last=raw[raw.length-1],spreadBps=(bestAsk-bestBid)/mid*10000;
 const snapshot:Snapshot={symbol,timestamp:Number(last[6]),source:'Binance Spot public REST',timeframe:'1m',prices:closes,volumes:raw.map(k=>Number(k[5])),spreadBps,dataQuality:1};
 return {snapshot,book,closes,ema9:ema(closes,9),ema21:ema(closes,21),rsi14:rsi(closes),lastPrice:closes[closes.length-1],observedAt:now};
}
async function runMarketScan(env:Env,symbol:string){
 const bundle=await marketBundle(env,symbol),report=buildMarketReport(bundle.snapshot),capital=await getCapital(env);
 const mtfRows=await Promise.all(['5m','15m','1h','4h'].map(async interval=>{const rows=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=80');const closes=rows.map(k=>Number(k[4]));const fast=ema(closes,9),slow=ema(closes,21);return {interval,fast,slow,direction:fast===null||slow===null?'unknown':fast>slow?'bullish':fast<slow?'bearish':'neutral',lastClose:closes[closes.length-1]};}));
 const bullish=bundle.ema9!==null&&bundle.ema21!==null&&bundle.ema9>bundle.ema21&&bundle.rsi14!==null&&bundle.rsi14>=50&&bundle.rsi14<=70;
 const bearish=bundle.ema9!==null&&bundle.ema21!==null&&bundle.ema9<bundle.ema21&&bundle.rsi14!==null&&bundle.rsi14>=30&&bundle.rsi14<=50;
 const stance:Evidence['stance']=bullish?'bullish':bearish?'bearish':'neutral';
 const aligned=mtfRows.every(x=>x.direction===stance)&&stance!=='neutral';
 const evidence:Evidence[]=[{agent:'Market Structure & EMA Trend',stance,confidence:Math.round(Math.min(99,Math.abs((bundle.ema9??0)-(bundle.ema21??0))/(bundle.lastPrice||1)*10000)),reason:'EMA9='+bundle.ema9?.toFixed(4)+' EMA21='+bundle.ema21?.toFixed(4)+' RSI14='+bundle.rsi14?.toFixed(2)+'; MTF '+mtfRows.map(x=>x.interval+':'+x.direction).join(', ')}];
 const result=evaluateIntegratedOpportunity({market:bundle.snapshot,book:bundle.book,evidence,capital,signalValid:false,economicsValid:false,exchangeHealthy:true,maxAgeMs:90000,now:bundle.observedAt});
 const id=uuid(),blockers=[...result.decision.arbitration.blockers,...result.decision.risk.reasons,'strategy validation and fee schedule are not configured; live execution is disabled'];
 const decision={id,symbol,observedAt:bundle.observedAt,source:bundle.snapshot.source,price:bundle.lastPrice,ema9:bundle.ema9,ema21:bundle.ema21,rsi14:bundle.rsi14,multiTimeframe:{aligned,directions:mtfRows},report,orderBook:result.orderBook,decision:'observation-only',tradeAuthorized:false,mode:'paper',blockers};
 await env.DB.prepare('INSERT INTO market_snapshots(id,symbol,source,timeframe,observed_at,payload_json) VALUES(?,?,?,?,?,?)').bind(uuid(),symbol,bundle.snapshot.source,'1m',bundle.observedAt,JSON.stringify(bundle.snapshot)).run();
 await env.DB.prepare('INSERT INTO orderbook_snapshots(id,symbol,source,observed_at,payload_json) VALUES(?,?,?,?,?)').bind(uuid(),symbol,'Binance Spot public REST',bundle.observedAt,JSON.stringify(result.orderBook)).run();
 await env.DB.prepare('INSERT INTO scan_decisions(id,symbol,observed_at,market_regime,direction,decision,blockers_json,report_json) VALUES(?,?,?,?,?,?,?,?)').bind(id,symbol,bundle.observedAt,String(report.regime),String(report.direction),'observation-only',JSON.stringify(blockers),JSON.stringify(decision)).run();
 await audit(env,'market.scan.completed','scheduled-market-scanner',{id,symbol,tradeAuthorized:false,blockers});
 return decision;
}
async function route(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if(path==='/health'){const db=await env.DB.prepare('SELECT 1 AS ok').first<any>();const id=env.ORCHESTRATOR.idFromName('global');const orch=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');return json({ok:db?.ok===1,service:'jpbots-6-backend',database:'connected',orchestrator:await orch.json(),liveTradingEnabled:false,now:Date.now()});}
 if(path==='/api/registry'&&request.method==='GET')return json({departments:departments.map(d=>({id:d.id,name:d.name,mandate:d.mandate,roles:d.agents.length,capabilities:d.capabilities,bots:d.bots??[]})),registeredRoleCount:allAgentRoles.length,platformServices,rolesAreDefinitions:true,independentWorkersRunning:false});
 if(path==='/api/providers'&&request.method==='GET')return json({marketData:{binanceSpot:{status:'connected-on-request',public:true},solanaDex:{provider:'DexScreener',status:'connected-on-request',public:true}},macroNews:{status:'not-configured',reason:'No licensed provider credentials configured'},traderDiscovery:{status:'not-configured',reason:'No supported source-trader data provider configured'},execution:{bitget:{status:'not-connected',markets:['spot','margin','usdt-m','coin-m','usdc-m']},solanaDex:{status:'read-only'}},liveTradingEnabled:false});
 if(path==='/api/market/tickers'&&request.method==='GET'){
  const symbols=(url.searchParams.get('symbols')||'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z0-9]{5,20}$/.test(x)).slice(0,20);
  const results=await Promise.all(symbols.map(async symbol=>{const x=await getJson<any>(binance(env)+'/api/v3/ticker/24hr?symbol='+symbol);return {symbol,price:Number(x.lastPrice),changePct:Number(x.priceChangePercent),volume:Number(x.quoteVolume),observedAt:Date.now(),source:'Binance Spot REST'};}));
  return json({source:'Binance Spot REST',observedAt:Date.now(),tickers:results});
 }
 if(path==='/api/market/klines'&&request.method==='GET'){
  const symbol=(url.searchParams.get('symbol')||'BTCUSDT').toUpperCase(),interval=url.searchParams.get('interval')||'1m',limit=Math.min(1000,Math.max(10,Number(url.searchParams.get('limit')||200)));
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!['1m','3m','5m','15m','30m','1h','4h','1d'].includes(interval))return json({error:'Invalid symbol or interval'},400);
  const rows=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+symbol+'&interval='+interval+'&limit='+limit);
  const candles=rows.map(k=>({openTime:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:k[6]}));
  await env.DB.prepare('INSERT INTO market_snapshots(id,symbol,source,timeframe,observed_at,payload_json) VALUES(?,?,?,?,?,?)').bind(uuid(),symbol,'Binance Spot REST',interval,Date.now(),JSON.stringify(candles)).run();
  return json({symbol,interval,source:'Binance Spot REST',candles});
 }
 if(path==='/api/market/depth'&&request.method==='GET'){
  const symbol=(url.searchParams.get('symbol')||'BTCUSDT').toUpperCase(),bundle=await marketBundle(env,symbol);
  const depth=analyseOrderBook(bundle.book);
  await env.DB.prepare('INSERT INTO orderbook_snapshots(id,symbol,source,observed_at,payload_json) VALUES(?,?,?,?,?)').bind(uuid(),symbol,'Binance Spot REST',Date.now(),JSON.stringify(depth)).run();
  return json({symbol,source:'Binance Spot REST',observedAt:Date.now(),...depth});
 }
 if(path==='/api/solana/pairs'&&request.method==='GET'){
  const token=url.searchParams.get('token')||'';
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token))return json({error:'A valid Solana token mint address is required'},400);
  const pairs=await getJson<any[]>(dexscreener(env)+'/token-pairs/v1/solana/'+token);
  return json({chain:'solana',source:'DexScreener',pairs:(pairs||[]).map(p=>({pairAddress:p.pairAddress,dexId:p.dexId,baseToken:p.baseToken,quoteToken:p.quoteToken,priceUsd:Number(p.priceUsd||0),liquidityUsd:Number(p.liquidity?.usd||0),volume24h:Number(p.volume?.h24||0),priceChange24h:Number(p.priceChange?.h24||0),url:p.url}))});
 }
 if(path==='/api/portfolio'&&request.method==='GET'){const row=await env.DB.prepare("SELECT * FROM portfolio_accounts WHERE account_id='primary'").first<any>();return json({configured:!!row,reconciled:row?.reconciled===1,account:row?{equity:row.equity,peakEquity:row.peak_equity,dailyLossPct:row.daily_loss_pct,weeklyLossPct:row.weekly_loss_pct,monthlyLossPct:row.monthly_loss_pct,openPositions:row.open_positions,leverage:row.leverage,marginUtilisationPct:row.margin_utilisation_pct}:null,liveTradingEnabled:false});}
 if(path==='/api/backtest'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as any;
  const symbol=String(body.symbol||'BTCUSDT').toUpperCase(),interval=String(body.interval||'5m'),fastPeriod=Number(body.fastPeriod||9),slowPeriod=Number(body.slowPeriod||21),feeBps=Number(body.feeBps??10),slippageBps=Number(body.slippageBps??5),initialEquity=Number(body.initialEquity||10000);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!['1m','3m','5m','15m','30m','1h','4h','1d'].includes(interval))return json({error:'Invalid symbol or interval'},400);
  const raw=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+symbol+'&interval='+interval+'&limit=1000');
  const candles=raw.map(k=>({openTime:k[0],closeTime:k[6],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
  const config={fastPeriod,slowPeriod,feeBps,slippageBps,initialEquity},result=runEmaBacktest(candles,config);
  if(!result.valid)return json({error:'Backtest validation failed',reasons:result.errors},422);
  const split=Math.floor(candles.length*.7),inSample=runEmaBacktest(candles.slice(0,split),config),outOfSample=runEmaBacktest(candles.slice(split),config),runId=uuid(),completedAt=Date.now();
  const response={runId,symbol,interval,source:'Binance Spot historical candles',strategy:'EMA crossover',strategyVersion:'1.0.0',candleCount:candles.length,config,metrics:result.metrics,walkForward:{inSample:inSample.metrics,outOfSample:outOfSample.metrics,splitIndex:split},trades:result.trades,liveTradingEnabled:false,qualification:'research-only; backtest alone cannot qualify a bot for live trading'};
  await env.DB.prepare('INSERT INTO backtest_runs(run_id,symbol,interval_name,strategy_id,strategy_version,started_at,completed_at,config_json,metrics_json,result_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(runId,symbol,interval,'ema-crossover','1.0.0',completedAt,completedAt,JSON.stringify(config),JSON.stringify(result.metrics),JSON.stringify(response)).run();
  await audit(env,'backtest.completed','historical-data-and-backtest-service',{runId,symbol,interval,metrics:result.metrics});
  return json(response);
 }
 if(path==='/api/backtests'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT run_id,symbol,interval_name,strategy_id,strategy_version,completed_at,metrics_json FROM backtest_runs ORDER BY completed_at DESC LIMIT 50').all();return json({runs:rows.results});}
 if(path==='/api/scan'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as {symbols?:string[]};const symbols=(body.symbols??['BTCUSDT','ETHUSDT','SOLUSDT']).filter(s=>/^[A-Z0-9]{5,20}$/.test(s)).slice(0,5);
  if(!symbols.length)return json({error:'No valid symbols supplied'},400);
  const scans=await Promise.allSettled(symbols.map(s=>runMarketScan(env,s)));
  return json({mode:'observation-only',liveTradingEnabled:false,scans:scans.map((s,i)=>s.status==='fulfilled'?s.value:{symbol:symbols[i],error:String(s.reason)})});
 }
 if(path==='/api/orchestrator/status'&&request.method==='GET'){const id=env.ORCHESTRATOR.idFromName('global');return env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');}
 if(path==='/api/audit'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,event_type,actor,created_at,payload_json FROM audit_events ORDER BY created_at DESC LIMIT 100').all();return json({events:rows.results});}
 return json({error:'Not found',path},404);
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{try{return cors(await route(request,env));}catch(error){return cors(json({error:error instanceof Error?error.message:'Unexpected backend failure',liveTradingEnabled:false},502));}},
 async scheduled(_event:any,env:Env):Promise<void>{const id=env.ORCHESTRATOR.idFromName('global'),stub=env.ORCHESTRATOR.get(id);await stub.fetch('https://orchestrator/enqueue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(['BTCUSDT','ETHUSDT','SOLUSDT'].map(symbol=>({id:uuid(),kind:'market-scan',symbol,createdAt:Date.now()})))});}
};
export class AgentOrchestrator {
 constructor(private state:DurableState,private env:Env){}
 async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/status'){const queue=await this.state.storage.get<Task[]>('queue')??[];return json({id:this.state.id.toString(),queued:queue.length,workerType:'durable-object-queue',aiWorkersRunning:false,liveTradingEnabled:false});}
  if(url.pathname==='/enqueue'&&request.method==='POST'){const tasks=await request.json() as Task[],queue=await this.state.storage.get<Task[]>('queue')??[];await this.state.storage.put('queue',[...queue,...tasks].slice(-500));await this.state.storage.setAlarm(Date.now()+1000);return json({accepted:tasks.length,queued:queue.length+tasks.length});}
  return json({error:'Not found'},404);
 }
 async alarm():Promise<void>{
  const queue=await this.state.storage.get<Task[]>('queue')??[],batch=queue.splice(0,3);
  for(const task of batch){try{const result=await runMarketScan(this.env,task.symbol);await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(task.id,'market-data-intelligence','market-scan','completed',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();}catch(error){await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(task.id,'market-data-intelligence','market-scan','failed',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify({error:String(error)})).run();}}
  await this.state.storage.put('queue',queue);if(queue.length)await this.state.storage.setAlarm(Date.now()+1000);
 }
}
