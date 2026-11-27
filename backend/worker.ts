import { allAgentRoles, departments, platformServices } from '../src/departments';
import { buildMarketReport, evaluateIntegratedOpportunity } from '../src/intelligence';
import { runEmaBacktest } from '../src/backtesting';
import type { Snapshot } from '../src/intelligence';
import { analyseOrderBook, capitalAuthority, defaultCapitalPolicy } from '../src/shared-services';
import type { Evidence, OrderBookSnapshot, CapitalState } from '../src/shared-services';
import { planPaperLongEntry, planPaperLongExit } from '../src/paper-trading';
import { runDepartmentCouncil, type WorkersAiBinding } from '../src/agent-runtime';
import { analyseInstitutionalMarket } from '../src/institutional-intelligence';
import { arbitrateRuntimeEvidence, handlerForInstitutionalFinding, planAutonomousPaperWorkflow, type RuntimeTask, type RuntimeEvidence } from '../src/autonomous-runtime';

interface D1Result { success:boolean; results?:any[]; meta?:any }
interface D1Statement { bind(...values:any[]):D1Statement; run():Promise<D1Result>; all<T=any>():Promise<{results:T[]}>; first<T=any>():Promise<T|null> }
interface D1Database { prepare(sql:string):D1Statement; batch(statements:D1Statement[]):Promise<D1Result[]> }
interface DurableStorage { get<T=any>(key:string):Promise<T|undefined>; put(key:string,value:any):Promise<void>; setAlarm(time:number):Promise<void>; delete(key:string):Promise<boolean> }
interface DurableState { storage:DurableStorage; id:{toString():string} }
interface DurableId { toString():string }
interface DurableNamespace { idFromName(name:string):DurableId; get(id:DurableId):{fetch(input:Request|string,init?:RequestInit):Promise<Response>} }
interface Env { DB:D1Database; ORCHESTRATOR:DurableNamespace; BINANCE_BASE_URL?:string; DEXSCREENER_BASE_URL?:string; AI?:WorkersAiBinding; AI_ENABLED?:string; AI_MODEL?:string; OPERATOR_API_TOKEN?:string }
type Kline=[number,string,string,string,string,string,number,string,string,string,string,string];
type Task={id:string;kind:'market-scan'|'institutional-role'|'institutional-scan';symbol:string;createdAt:number;attempts?:number;roleId?:string;correlationId?:string;payload?:any};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const cors=(response:Response)=>{const h=new Headers(response.headers);h.set('access-control-allow-origin','*');h.set('access-control-allow-methods','GET,POST,OPTIONS');h.set('access-control-allow-headers','content-type,authorization');return new Response(response.body,{status:response.status,headers:h});};
const uuid=()=>crypto.randomUUID();
const binance=(env:Env)=> (env.BINANCE_BASE_URL||'https://data-api.binance.vision').replace(/\/$/,'');
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
 if(raw.some(k=>{const values=[Number(k[1]),Number(k[2]),Number(k[3]),Number(k[4]),Number(k[5])];return values.some(x=>!Number.isFinite(x)||x<=0)||Number(k[2])<Number(k[3])||Number(k[0])<0;}))throw new Error('Invalid or incomplete candle data received');
 const bidLevels=depth.bids.map(x=>({price:Number(x[0]),quantity:Number(x[1])})),askLevels=depth.asks.map(x=>({price:Number(x[0]),quantity:Number(x[1])}));
 const bestBid=bidLevels[0]?.price??0,bestAsk=askLevels[0]?.price??0,mid=(bestBid+bestAsk)/2;
 if(!(mid>0)||bestAsk<=bestBid)throw new Error('Invalid or crossed order book');
 const now=Date.now(),book:OrderBookSnapshot={symbol,timestamp:now,mid,bids:bidLevels,asks:askLevels,trades:trades.map(t=>({price:Number(t.p),quantity:Number(t.q),aggressor:t.m?'sell':'buy',timestamp:t.T}))};
 const last=raw[raw.length-1],spreadBps=(bestAsk-bestBid)/mid*10000;
 const snapshot:Snapshot={symbol,timestamp:now,source:'Binance Spot public REST',timeframe:'1m',prices:closes,volumes:raw.map(k=>Number(k[5])),spreadBps,dataQuality:.95};
 return {snapshot,book,closes,ema9:ema(closes,9),ema21:ema(closes,21),rsi14:rsi(closes),lastPrice:closes[closes.length-1],candleCloseTime:Number(last[6]),observedAt:now};
}

async function getPaperAccount(env:Env){return env.DB.prepare("SELECT * FROM paper_accounts WHERE account_id='default'").first<any>();}
function paperCapital(row:any,exchangeHealthy=true,dataFresh=true):CapitalState{return {equity:Number(row?.equity??0),peakEquity:Number(row?.peak_equity??0),dailyLossPct:Number(row?.daily_loss_pct??0),weeklyLossPct:Number(row?.weekly_loss_pct??0),monthlyLossPct:Number(row?.monthly_loss_pct??0),openPositions:Number(row?.open_positions??0),correlatedExposurePct:0,leverage:1,marginUtilisationPct:0,exchangeHealthy,dataFresh,accountReconciled:!!row};}
function paperWeekKey(timestamp:number){const d=new Date(timestamp);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
async function closePaperPosition(env:Env,position:any,book:OrderBookSnapshot,reason:string){
 const claimed=await env.DB.prepare("UPDATE paper_positions SET status='closing' WHERE position_id=? AND status='open'").bind(position.position_id).run();
 if(Number(claimed.meta?.changes??0)!==1)return {closed:false,reason:'position is no longer open'};
 const config=JSON.parse(String(position.payload_json||'{}')) as {feeBps?:number};
 const feeBps=Number.isFinite(config.feeBps)?Number(config.feeBps):10,now=Date.now();
 const exit=planPaperLongExit({book,quantity:Number(position.quantity),entryPrice:Number(position.entry_price),entryFee:Number(position.entry_fee),feeBps,now});
 if(!exit.valid||exit.averageExitPrice===null){await env.DB.prepare("UPDATE paper_positions SET status='open' WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,errors:exit.errors};}
 const account=await getPaperAccount(env);if(!account){await env.DB.prepare("UPDATE paper_positions SET status='open' WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,reason:'paper account unavailable'};}
 const equityBefore=Number(account.equity),equityAfter=equityBefore+exit.netPnl,peak=Math.max(Number(account.peak_equity),equityAfter);
 const dayKey=new Date(now).toISOString().slice(0,10),weekKey=paperWeekKey(now),monthKey=dayKey.slice(0,7);
 const dayStart=account.day_key===dayKey&&Number(account.day_start_equity)>0?Number(account.day_start_equity):equityBefore;
 const weekStart=account.week_key===weekKey&&Number(account.week_start_equity)>0?Number(account.week_start_equity):equityBefore;
 const monthStart=account.month_key===monthKey&&Number(account.month_start_equity)>0?Number(account.month_start_equity):equityBefore;
 const loss=(start:number)=>start>0?Math.max(0,(start-equityAfter)/start*100):100;
 const openPositions=Math.max(0,Number(account.open_positions)-1),fillId=uuid();
 await env.DB.batch([
  env.DB.prepare("UPDATE paper_positions SET status='closed',closed_at=?,exit_price=?,exit_fee=?,gross_pnl=?,net_pnl=?,exit_reason=? WHERE position_id=? AND status='closing'").bind(now,exit.averageExitPrice,exit.exitFee,exit.grossPnl,exit.netPnl,reason,position.position_id),
  env.DB.prepare("INSERT INTO paper_fills(fill_id,position_id,symbol,side,quantity,price,fee,slippage_bps,created_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(fillId,position.position_id,position.symbol,'sell',exit.filledQuantity,exit.averageExitPrice,exit.exitFee,exit.slippageBps,now,JSON.stringify({reason,netPnl:exit.netPnl})),
  env.DB.prepare("INSERT INTO paper_execution_events(event_id,symbol,side,event_type,observed_at,payload_json) VALUES(?,?,?,?,?,?)").bind(uuid(),position.symbol,'sell','paper.position.closed',now,JSON.stringify({positionId:position.position_id,reason,exit})),
  env.DB.prepare("UPDATE paper_accounts SET equity=?,peak_equity=?,daily_loss_pct=?,weekly_loss_pct=?,monthly_loss_pct=?,open_positions=?,day_key=?,day_start_equity=?,week_key=?,week_start_equity=?,month_key=?,month_start_equity=?,updated_at=? WHERE account_id='default'").bind(equityAfter,peak,loss(dayStart),loss(weekStart),loss(monthStart),openPositions,dayKey,dayStart,weekKey,weekStart,monthKey,monthStart,now)
 ]);
 await audit(env,'paper.position.closed','paper-execution-engine',{positionId:position.position_id,symbol:position.symbol,reason,netPnl:exit.netPnl,equityAfter});
 return {closed:true,positionId:position.position_id,exitPrice:exit.averageExitPrice,grossPnl:exit.grossPnl,netPnl:exit.netPnl,reason};
}
async function monitorPaperPositions(env:Env,symbol:string,book:OrderBookSnapshot){
 const rows=await env.DB.prepare("SELECT * FROM paper_positions WHERE symbol=? AND status='open' ORDER BY opened_at ASC LIMIT 25").bind(symbol).all<any>();
 const results=[];
 for(const position of rows.results){const reason=book.mid<=Number(position.stop_price)?'stop-loss':book.mid>=Number(position.target_price)?'take-profit':null;if(reason)results.push(await closePaperPosition(env,position,book,reason));}
 return results;
}
async function createPaperOrder(env:Env,body:any){
 const symbol=String(body.symbol||'').toUpperCase(),stopPrice=Number(body.stopPrice),targetPrice=Number(body.targetPrice),riskPct=Number(body.riskPct??0.2),feeBps=Number(body.feeBps??10);
 if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!Number.isFinite(stopPrice)||!Number.isFinite(targetPrice)||!Number.isFinite(riskPct)||!Number.isFinite(feeBps))return {error:'symbol, stopPrice, targetPrice and valid risk/fee values are required',status:400};
 const account=await getPaperAccount(env);if(!account)return {error:'Paper account has not been initialized; apply database migrations',status:503};
 const bundle=await marketBundle(env,symbol),capital=paperCapital(account,true,Date.now()-bundle.book.timestamp<=90000),risk=capitalAuthority(capital,defaultCapitalPolicy);
 if(!risk.allowNewEntries)return {error:'Paper capital protection veto',reasons:risk.reasons,status:409};
 const plan=planPaperLongEntry({book:bundle.book,equity:capital.equity,stopPrice,targetPrice,riskPct,feeBps,maxRiskPct:defaultCapitalPolicy.maxRiskPerTradePct,now:Date.now()});
 if(!plan.valid||plan.averageFillPrice===null)return {error:'Paper order rejected',reasons:plan.errors,status:422};
 const positionId=uuid(),fillId=uuid(),now=Date.now(),strategy=String(body.strategy||'operator-paper-test').slice(0,100);
 const reservation=await env.DB.prepare("UPDATE paper_accounts SET open_positions=open_positions+1,updated_at=? WHERE account_id='default' AND open_positions < ? AND equity > 0").bind(now,defaultCapitalPolicy.maxPositions).run();
 if(Number(reservation.meta?.changes??0)!==1)return {error:'Paper position capacity was reached concurrently',status:409};
 const payload={feeBps,source:bundle.book.symbol?'Binance Spot public order book':'unknown',referencePrice:plan.referencePrice,slippageBps:plan.slippageBps,netRewardRisk:plan.netRewardRisk};
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO paper_positions(position_id,symbol,side,quantity,entry_price,stop_price,target_price,entry_fee,risk_pct,strategy,status,opened_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?)").bind(positionId,symbol,'long',plan.quantity,plan.averageFillPrice,stopPrice,targetPrice,plan.entryFee,plan.actualRiskPct,strategy,now,JSON.stringify(payload)),
   env.DB.prepare("INSERT INTO paper_fills(fill_id,position_id,symbol,side,quantity,price,fee,slippage_bps,created_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(fillId,positionId,symbol,'buy',plan.quantity,plan.averageFillPrice,plan.entryFee,plan.slippageBps,now,JSON.stringify({referencePrice:plan.referencePrice,notional:plan.notional})),
   env.DB.prepare("INSERT INTO paper_execution_events(event_id,symbol,side,event_type,observed_at,payload_json) VALUES(?,?,?,?,?,?)").bind(uuid(),symbol,'buy','paper.position.opened',now,JSON.stringify({positionId,plan,strategy}))
  ]);
 }catch(error){await env.DB.prepare("UPDATE paper_accounts SET open_positions=MAX(0,open_positions-1),updated_at=? WHERE account_id='default'").bind(Date.now()).run();throw error;}
 await audit(env,'paper.position.opened','paper-execution-engine',{positionId,symbol,quantity:plan.quantity,entryPrice:plan.averageFillPrice,riskPct:plan.actualRiskPct,strategy});
 return {position:{positionId,symbol,side:'long',quantity:plan.quantity,entryPrice:plan.averageFillPrice,stopPrice,targetPrice,riskPct:plan.actualRiskPct,entryFee:plan.entryFee,status:'open',openedAt:now},execution:{referencePrice:plan.referencePrice,slippageBps:plan.slippageBps,netRewardRisk:plan.netRewardRisk},liveTradingEnabled:false};
}

async function runMarketScan(env:Env,symbol:string){
 const bundle=await marketBundle(env,symbol),report=buildMarketReport(bundle.snapshot),capital=await getCapital(env);
 const mtfRows=await Promise.all(['5m','15m','1h','4h'].map(async interval=>{const rows=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=80');const closes=rows.map(k=>Number(k[4]));const fast=ema(closes,9),slow=ema(closes,21);return {interval,fast,slow,direction:fast===null||slow===null?'unknown':fast>slow?'bullish':fast<slow?'bearish':'neutral',lastClose:closes[closes.length-1]};}));
 const bullish=bundle.ema9!==null&&bundle.ema21!==null&&bundle.ema9>bundle.ema21&&bundle.rsi14!==null&&bundle.rsi14>=50&&bundle.rsi14<=70;
 const bearish=bundle.ema9!==null&&bundle.ema21!==null&&bundle.ema9<bundle.ema21&&bundle.rsi14!==null&&bundle.rsi14>=30&&bundle.rsi14<=50;
 const stance:Evidence['stance']=bullish?'bullish':bearish?'bearish':'neutral';
 const aligned=mtfRows.every(x=>x.direction===stance)&&stance!=='neutral';
 const evidence:Evidence[]=[{agent:'Market Structure & EMA Trend',stance,confidence:Math.round(Math.min(99,Math.abs((bundle.ema9??0)-(bundle.ema21??0))/(bundle.lastPrice||1)*10000)),reason:'EMA9='+bundle.ema9?.toFixed(4)+' EMA21='+bundle.ema21?.toFixed(4)+' RSI14='+bundle.rsi14?.toFixed(2)+'; MTF '+mtfRows.map(x=>x.interval+':'+x.direction).join(', ')}];
 const result=evaluateIntegratedOpportunity({market:bundle.snapshot,book:bundle.book,evidence,capital,signalValid:(bullish||bearish)&&aligned&&report.tradeable,economicsValid:false,exchangeHealthy:true,proposedRiskPct:0,maxAgeMs:90000,now:bundle.observedAt});
 const id=uuid(),blockers=[...result.decision.arbitration.blockers,...result.decision.risk.reasons,'strategy validation and fee schedule are not configured; live execution is disabled'];
 const decision={id,symbol,observedAt:bundle.observedAt,source:bundle.snapshot.source,price:bundle.lastPrice,candleCloseTime:bundle.candleCloseTime,ema9:bundle.ema9,ema21:bundle.ema21,rsi14:bundle.rsi14,multiTimeframe:{aligned,directions:mtfRows},report,orderBook:result.orderBook,decision:'observation-only',tradeAuthorized:false,mode:'paper',blockers};
 await env.DB.prepare('INSERT INTO market_snapshots(id,symbol,source,timeframe,observed_at,payload_json) VALUES(?,?,?,?,?,?)').bind(uuid(),symbol,bundle.snapshot.source,'1m',bundle.observedAt,JSON.stringify(bundle.snapshot)).run();
 await env.DB.prepare('INSERT INTO orderbook_snapshots(id,symbol,source,observed_at,payload_json) VALUES(?,?,?,?,?)').bind(uuid(),symbol,'Binance Spot public REST',bundle.observedAt,JSON.stringify(result.orderBook)).run();
 await env.DB.prepare('INSERT INTO scan_decisions(id,symbol,observed_at,market_regime,direction,decision,blockers_json,report_json) VALUES(?,?,?,?,?,?,?,?)').bind(id,symbol,bundle.observedAt,String(report.regime),String(report.direction),'observation-only',JSON.stringify(blockers),JSON.stringify(decision)).run();
 await audit(env,'market.scan.completed','scheduled-market-scanner',{id,symbol,tradeAuthorized:false,blockers});
 await monitorPaperPositions(env,symbol,bundle.book);
 return decision;
}
async function route(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if(path==='/health'){const db=await env.DB.prepare('SELECT 1 AS ok').first<any>();const id=env.ORCHESTRATOR.idFromName('global');const orch=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');return json({ok:db?.ok===1,service:'jpbots-6-backend',database:'connected',orchestrator:await orch.json(),liveTradingEnabled:false,now:Date.now()});}
 if(path==='/api/registry'&&request.method==='GET')return json({departments:departments.map(d=>({id:d.id,name:d.name,mandate:d.mandate,roles:d.agents.length,capabilities:d.capabilities,bots:d.bots??[]})),registeredRoleCount:allAgentRoles.length,roles:allAgentRoles.map(r=>({id:r.departmentId+':'+r.name,name:r.name,task:r.task,department:r.department})),platformServices,departmentRuntime:departments.map(d=>({departmentId:d.id,status:d.id==='market'?'scheduled-market-scanner':d.id==='risk'?'shared-final-capital-veto':d.id==='signals'?'shared-evidence-arbitration':d.id==='strategy'?'shared-regime-selector':d.id==='jb2'?'shared-analytics-primitives':d.id==='validation'?'on-demand-EMA-backtest':d.id==='institutional'?'persistent-institutional-role-runtime':'registered-no-independent-worker-handler',independentWorkersRunning:false})),rolesAreDefinitions:true,independentWorkersRunning:false});
 if(path==='/api/agents'&&request.method==='GET'){
  const states=await env.DB.prepare('SELECT role_id,enabled,status,heartbeat_at,last_error,updated_at FROM agent_state').all<any>(),byId=new Map(states.results.map(x=>[x.role_id,x]));
  return json({registered:allAgentRoles.length,agents:allAgentRoles.map(r=>{const id=r.departmentId+':'+r.name,state=byId.get(id);return {id,name:r.name,department:r.department,task:r.task,status:state?.status??'REGISTERED',enabled:state?.enabled===1,heartbeatAt:state?.heartbeat_at??null,lastError:state?.last_error??null,workerProcessRunning:false};})});
 }
 if(path==='/api/agent-tasks'&&request.method==='GET'){const requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.min(500,Math.max(1,requested)):100;const rows=await env.DB.prepare('SELECT id,role_id,task_type,status,created_at,updated_at,payload_json,result_json FROM agent_tasks ORDER BY created_at DESC LIMIT ?').bind(limit).all();return json({tasks:rows.results});}
 if(path==='/api/decisions'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,symbol,observed_at,market_regime,direction,decision,blockers_json,report_json FROM scan_decisions ORDER BY observed_at DESC LIMIT 100').all();return json({decisions:rows.results});}
 if(path==='/api/providers'&&request.method==='GET')return json({marketData:{binanceSpot:{status:'connected-on-request',public:true},bitgetPublic:{status:'connected-on-request',public:true,markets:['spot','margin-reference','usdt-m','coin-m','usdc-m']},solanaDex:{provider:'DexScreener',status:'connected-on-request',public:true},solanaNewPools:{provider:'GeckoTerminal',status:'connected-on-request',public:true}},macroNews:{status:'not-configured',reason:'No licensed provider credentials configured'},traderDiscovery:{status:'not-configured',reason:'No supported source-trader data provider configured'},execution:{bitget:{status:'not-connected',markets:['spot','margin','usdt-m','coin-m','usdc-m']},solanaDex:{status:'read-only'}},liveTradingEnabled:false});
 if(path==='/api/market/tickers'&&request.method==='GET'){
  const symbols=(url.searchParams.get('symbols')||'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z0-9]{5,20}$/.test(x)).slice(0,20);
  const results=await Promise.all(symbols.map(async symbol=>{const x=await getJson<any>(binance(env)+'/api/v3/ticker/24hr?symbol='+symbol);const price=Number(x.lastPrice),changePct=Number(x.priceChangePercent),volume=Number(x.quoteVolume);if(!Number.isFinite(price)||price<=0||!Number.isFinite(changePct)||!Number.isFinite(volume))throw new Error('Invalid Binance ticker data for '+symbol);return {symbol,price,changePct,volume,observedAt:Date.now(),source:'Binance Spot REST'};}));
  return json({source:'Binance Spot REST',observedAt:Date.now(),tickers:results});
 }
 if(path==='/api/market/bitget/tickers'&&request.method==='GET'){
  const market=url.searchParams.get('market')||'spot',symbols=(url.searchParams.get('symbols')||'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z0-9]{5,20}$/.test(x)).slice(0,10);
  const productType:Record<string,string>={'usdt-m':'USDT-FUTURES','coin-m':'COIN-FUTURES','usdc-m':'USDC-FUTURES'};
  if(!['spot','margin','usdt-m','coin-m','usdc-m'].includes(market))return json({error:'Unsupported Bitget market category'},400);
  const rows=await Promise.all(symbols.map(async symbol=>{const endpoint=market==='spot'||market==='margin'?'/api/v2/spot/market/tickers?symbol='+symbol:'/api/v2/mix/market/ticker?productType='+productType[market]+'&symbol='+symbol;const payload=await getJson<any>('https://api.bitget.com'+endpoint);if(payload.code!=='00000')throw new Error('Bitget '+symbol+': '+String(payload.msg||payload.code));const x=Array.isArray(payload.data)?payload.data[0]:payload.data;return {symbol,market,price:Number(x?.lastPr||0),change24h:x?.changeUtc24h??x?.change24h??null,baseVolume:Number(x?.baseVolume||0),quoteVolume:Number(x?.quoteVolume||0),bid:Number(x?.bidPr||0),ask:Number(x?.askPr||0),source:'Bitget public REST'};}));
  return json({market,source:'Bitget public REST',observedAt:Date.now(),tickers:rows});
 }
 if(path==='/api/market/klines'&&request.method==='GET'){
  const symbol=(url.searchParams.get('symbol')||'BTCUSDT').toUpperCase(),interval=url.searchParams.get('interval')||'1m',requestedLimit=Number(url.searchParams.get('limit')||200),limit=Number.isFinite(requestedLimit)?Math.min(1000,Math.max(10,requestedLimit)):200;
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
  return json({source:'Binance Spot REST',observedAt:Date.now(),...depth});
 }
 if(path==='/api/solana/new-pools'&&request.method==='GET'){
  const requestedLimit=Number(url.searchParams.get('limit')||10),limit=Number.isFinite(requestedLimit)?Math.min(20,Math.max(1,requestedLimit)):10;
  const payload=await getJson<any>('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1');
  const pools=(payload.data||[]).slice(0,limit).map((p:any)=>({poolId:p.id,attributes:p.attributes,baseTokenId:p.relationships?.base_token?.data?.id,quoteTokenId:p.relationships?.quote_token?.data?.id,source:'GeckoTerminal'}));
  return json({chain:'solana',source:'GeckoTerminal public API',observedAt:Date.now(),pools});
 }
 if(path==='/api/solana/pairs'&&request.method==='GET'){
  const token=url.searchParams.get('token')||'';
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token))return json({error:'A valid Solana token mint address is required'},400);
  const pairs=await getJson<any[]>(dexscreener(env)+'/token-pairs/v1/solana/'+token);
  return json({chain:'solana',source:'DexScreener',pairs:(pairs||[]).map(p=>({pairAddress:p.pairAddress,dexId:p.dexId,baseToken:p.baseToken,quoteToken:p.quoteToken,priceUsd:Number(p.priceUsd||0),liquidityUsd:Number(p.liquidity?.usd||0),volume24h:Number(p.volume?.h24||0),priceChange24h:Number(p.priceChange?.h24||0),url:p.url}))});
 }


 if(path==='/api/ai/status'&&request.method==='GET')return json({provider:'Cloudflare Workers AI',bindingAvailable:!!env.AI,enabled:env.AI_ENABLED==='true',model:env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it',automaticAnalysis:false,liveTradingEnabled:false,reason:env.AI_ENABLED==='true'?'AI inference is enabled for explicit department analysis requests':'AI inference is disabled by default; enable AI_ENABLED only after reviewing account usage and model costs'});
 if(path==='/api/agents/analyse'&&request.method==='POST'){
  if(!env.OPERATOR_API_TOKEN||request.headers.get('authorization')!=='Bearer '+env.OPERATOR_API_TOKEN)return json({error:'Operator authentication required'},401);
  if(env.AI_ENABLED!=='true'||!env.AI)return json({error:'AI specialist analysis is not enabled',bindingAvailable:!!env.AI,enablement:'Configure the Workers AI binding and set AI_ENABLED=true after reviewing usage costs',liveTradingEnabled:false},503);
  const body=await request.json().catch(()=>({})) as any,departmentId=String(body.departmentId||'market'),symbol=String(body.symbol||'BTCUSDT').toUpperCase(),department=departments.find(x=>x.id===departmentId);
  if(!department)return json({error:'Unknown departmentId'},404);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))return json({error:'Invalid market symbol'},400);
  const bundle=await marketBundle(env,symbol),report=buildMarketReport(bundle.snapshot),depth=analyseOrderBook(bundle.book),model=env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it';
  const result=await runDepartmentCouncil(env.AI,model,department,{symbol,observedAt:bundle.observedAt,price:bundle.lastPrice,marketReport:report,orderBook:depth});
  const now=Date.now(),taskRows=result.findings.map(f=>env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),department.id+':'+f.roleName,'ai-department-analysis','completed',now,now,JSON.stringify({departmentId,symbol,model,promptVersion:result.promptVersion}),JSON.stringify(f)));
  for(const roleName of result.missingRoles)taskRows.push(env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),department.id+':'+roleName,'ai-department-analysis','incomplete',now,now,JSON.stringify({departmentId,symbol,model,promptVersion:result.promptVersion}),JSON.stringify({reason:'No validated finding returned by the model'})));
  const findingsByRole=new Map(result.findings.map(f=>[f.roleName,f]));
  const stateRows=department.agents.map(role=>{const finding=findingsByRole.get(role.name),status=finding?'ANALYSED':'INCOMPLETE',lastError=finding?null:'No validated specialist finding returned by the model';return env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,0,?,?,?,?) ON CONFLICT(role_id) DO UPDATE SET enabled=0,status=excluded.status,heartbeat_at=excluded.heartbeat_at,last_error=excluded.last_error,updated_at=excluded.updated_at").bind(department.id+':'+role.name,status,now,lastError,now);});
  if(taskRows.length||stateRows.length)await env.DB.batch([...taskRows,...stateRows]);
  await audit(env,'ai.department.analysis.completed','workers-ai-department-council',{departmentId,symbol,model,valid:result.valid,findings:result.findings.length,missingRoles:result.missingRoles.length,errors:result.errors});
  const plainLanguageReport=department.name+' assessment for '+symbol+': '+result.findings.map(f=>f.roleName+' reports '+f.stance+' with '+f.confidence+'% evidence confidence. '+f.reason).join(' ')+' '+(result.missingRoles.length?result.missingRoles.length+' specialist findings were unavailable.':'All registered specialist findings were validated.')+' This is advisory analysis only; it does not authorise a trade.';return json({department:department.name,symbol,report:plainLanguageReport,tradeAuthorized:false,liveTradingEnabled:false,execution:'analysis-only'});
 }
 if(path==='/api/institutional/analyse'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))return json({error:'Invalid market symbol'},400);
  const bundle=await marketBundle(env,symbol),raw=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval=1m&limit=120');
  const candles=raw.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
  const analysis=analyseInstitutionalMarket({symbol,observedAt:bundle.observedAt,price:bundle.lastPrice,candles,book:bundle.book,trades:(bundle.book.trades??[]).filter((t):t is {price:number;quantity:number;aggressor:'buy'|'sell';timestamp:number}=>t.aggressor==='buy'||t.aggressor==='sell')});
  const analysisId=uuid(),createdAt=Date.now(),tasks=analysis.findings.map(f=>({id:uuid(),kind:'institutional-role' as const,symbol,createdAt,roleId:'institutional:'+f.agent,correlationId:analysisId,payload:f}));
  await env.DB.batch([
   env.DB.prepare('INSERT INTO institutional_analyses(analysis_id,symbol,observed_at,source,result_json) VALUES(?,?,?,?,?)').bind(analysisId,symbol,createdAt,'Binance Spot public REST',JSON.stringify(analysis)),
   ...tasks.map(t=>env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'queued',?,?,?,NULL)").bind(t.id,t.roleId,'institutional-role-analysis',createdAt,createdAt,JSON.stringify({symbol,analysisId,roleId:t.roleId,finding:t.payload})))
  ]);
  const id=env.ORCHESTRATOR.idFromName('global'),queued=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/enqueue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(tasks)});
  const queueResult=await queued.json() as any;
  if(queueResult.rejectedCapacity>0)await env.DB.batch(tasks.slice(queueResult.accepted).map(t=>env.DB.prepare("UPDATE agent_tasks SET status='rejected',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify({reason:'Durable task queue capacity reached'}),t.id)));
  const report=['Institutional market analysis for '+symbol+' at '+analysis.price+'.', 'Overall assessment: '+analysis.overall.stance+'; confidence '+analysis.overall.confidence+' out of 100.',...analysis.findings.map(f=>f.agent+': '+f.summary), 'Detected '+analysis.fvg.length+' fair-value gaps and '+analysis.liquidityPools.length+' candidate liquidity pools.', 'Point of control: '+(analysis.volumeProfile?analysis.volumeProfile.poc.toFixed(6):'unavailable')+'.', 'No trade is authorised. Candidate entry zones require independent strategy, market-structure, execution-cost and capital-risk validation.',...analysis.limitations].join('\n');
  await audit(env,'institutional.analysis.created','institutional-intelligence-engine',{analysisId,symbol,tasks:tasks.length,liveTradingEnabled:false});
  return json({analysisId,symbol,report,taskAssignment:{requested:tasks.length,accepted:queueResult.accepted??0,rejectedCapacity:queueResult.rejectedCapacity??0},candidateEntryZones:analysis.entryZones,overall:analysis.overall,liveTradingEnabled:false,execution:'paper-only-after-independent-validation'});
 }
 if(path==='/api/institutional/latest'&&request.method==='GET'){
  const symbol=(url.searchParams.get('symbol')||'BTCUSDT').toUpperCase(),row=await env.DB.prepare('SELECT analysis_id,symbol,observed_at,result_json FROM institutional_analyses WHERE symbol=? ORDER BY observed_at DESC LIMIT 1').bind(symbol).first<any>();
  if(!row)return json({error:'No institutional analysis available for this symbol'},404);
  const a=JSON.parse(row.result_json),report='Institutional analysis for '+a.symbol+': '+a.overall.stance+' bias, confidence '+a.overall.confidence+'. '+a.findings.map((f:any)=>f.agent+': '+f.summary).join(' ');
  return json({analysisId:row.analysis_id,symbol:row.symbol,observedAt:row.observed_at,report,fvg:a.fvg,liquidityPools:a.liquidityPools,entryZones:a.entryZones,volumeProfile:a.volumeProfile,auction:a.auction,findings:a.findings,overall:a.overall,limitations:a.limitations,liveTradingEnabled:false});
 }
 if(path==='/api/runtime/status'&&request.method==='GET'){
  const [queued,active,completed,messages,evidence,runs]=await Promise.all([
   env.DB.prepare("SELECT COUNT(*) AS count FROM agent_tasks WHERE status='queued'").first<any>(),
   env.DB.prepare("SELECT COUNT(*) AS count FROM agent_tasks WHERE status IN ('running','retrying')").first<any>(),
   env.DB.prepare("SELECT COUNT(*) AS count FROM agent_tasks WHERE status='completed'").first<any>(),
   env.DB.prepare('SELECT COUNT(*) AS count FROM agent_messages').first<any>(),
   env.DB.prepare('SELECT COUNT(*) AS count FROM agent_evidence WHERE expires_at>?').bind(Date.now()).first<any>(),
   env.DB.prepare('SELECT run_id,symbol,status,started_at,completed_at,decision_json FROM paper_strategy_runs ORDER BY started_at DESC LIMIT 20').all<any>()
  ]);
  return json({queued:Number(queued?.count??0),active:Number(active?.count??0),completed:Number(completed?.count??0),interAgentMessages:Number(messages?.count??0),freshEvidence:Number(evidence?.count??0),supervisorRuns:runs.results.map((r:any)=>({runId:r.run_id,symbol:r.symbol,status:r.status,startedAt:r.started_at,completedAt:r.completed_at,decision:JSON.parse(r.decision_json)})),independentRoleHandlers:10,liveTradingEnabled:false});
 }
 if(path==='/api/institutional/analyses'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT analysis_id,symbol,observed_at,source FROM institutional_analyses ORDER BY observed_at DESC LIMIT 50').all();return json({analyses:rows.results,liveTradingEnabled:false});}
 if(path==='/api/paper/account'&&request.method==='GET'){const account=await getPaperAccount(env);return json({configured:!!account,account:account?{accountId:account.account_id,mode:'paper',initialEquity:account.initial_equity,equity:account.equity,peakEquity:account.peak_equity,dailyLossPct:account.daily_loss_pct,weeklyLossPct:account.weekly_loss_pct,monthlyLossPct:account.monthly_loss_pct,openPositions:account.open_positions,updatedAt:account.updated_at}:null,liveTradingEnabled:false});}
 if(path==='/api/paper/positions'&&request.method==='GET'){const rows=await env.DB.prepare("SELECT * FROM paper_positions ORDER BY opened_at DESC LIMIT 100").all<any>();return json({positions:rows.results,liveTradingEnabled:false});}
 if(path==='/api/paper/fills'&&request.method==='GET'){const rows=await env.DB.prepare("SELECT * FROM paper_fills ORDER BY created_at DESC LIMIT 200").all<any>();return json({fills:rows.results,liveTradingEnabled:false});}
 if(path==='/api/paper/orders'&&request.method==='POST'){const body=await request.json().catch(()=>null);if(!body||body.mode!=='paper'||body.side!=='long')return json({error:"Only explicit paper-mode long orders are supported by this simulator",liveTradingEnabled:false},400);const result=await createPaperOrder(env,body);const status=Number((result as any).status??200);return json(result,status);}
 const closeMatch=path.match(/^\/api\/paper\/positions\/([a-f0-9-]+)\/close$/i);
 if(closeMatch&&request.method==='POST'){const position=await env.DB.prepare("SELECT * FROM paper_positions WHERE position_id=?").bind(closeMatch[1]).first<any>();if(!position||position.status!=='open')return json({error:'Open paper position not found'},404);const bundle=await marketBundle(env,String(position.symbol));const body=await request.json().catch(()=>({})) as any;const reason=typeof body.reason==='string'?body.reason.slice(0,80):'operator-close';const result=await closePaperPosition(env,position,bundle.book,reason);return json(result,result.closed?200:409);}
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
  const response={runId,symbol,interval,source:'Binance Spot historical candles',strategy:'EMA crossover · spot long-only',marketType:'spot',strategyVersion:'1.0.0',candleCount:candles.length,config,metrics:result.metrics,walkForward:{inSample:inSample.metrics,outOfSample:outOfSample.metrics,splitIndex:split},trades:result.trades,liveTradingEnabled:false,qualification:'research-only; backtest alone cannot qualify a bot for live trading'};
  await env.DB.prepare('INSERT INTO backtest_runs(run_id,symbol,interval_name,strategy_id,strategy_version,started_at,completed_at,config_json,metrics_json,result_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(runId,symbol,interval,'ema-crossover','1.0.0',completedAt,completedAt,JSON.stringify(config),JSON.stringify(result.metrics),JSON.stringify(response)).run();
  await audit(env,'backtest.completed','historical-data-and-backtest-service',{runId,symbol,interval,metrics:result.metrics});
  return json(response);
 }
 if(path==='/api/backtests'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT run_id,symbol,interval_name,strategy_id,strategy_version,completed_at,metrics_json FROM backtest_runs ORDER BY completed_at DESC LIMIT 50').all();return json({runs:rows.results});}
 if(path==='/api/scan'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as {symbols?:unknown};const requested=Array.isArray(body.symbols)?body.symbols:['BTCUSDT','ETHUSDT','SOLUSDT'];const symbols=requested.filter((s):s is string=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s)).slice(0,5);
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
 async scheduled(_event:any,env:Env):Promise<void>{const id=env.ORCHESTRATOR.idFromName('global'),stub=env.ORCHESTRATOR.get(id),symbols=['BTCUSDT','ETHUSDT','SOLUSDT'],createdAt=Date.now(),tasks=symbols.flatMap(symbol=>[{id:uuid(),kind:'market-scan',symbol,createdAt},{id:uuid(),kind:'institutional-scan',symbol,createdAt}]);await stub.fetch('https://orchestrator/enqueue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(tasks)});}
};
export class AgentOrchestrator {
 constructor(private state:DurableState,private env:Env){}
 async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/status'){const queue=await this.state.storage.get<Task[]>('queue')??[],lastProcessedAt=await this.state.storage.get<number>('lastProcessedAt')??null,lastError=await this.state.storage.get<string>('lastError')??null,processedCount=await this.state.storage.get<number>('processedCount')??0;return json({id:this.state.id.toString(),queued:queue.length,lastProcessedAt,lastError,processedCount,workerType:'durable-object-queue',aiWorkersRunning:false,liveTradingEnabled:false});}
  if(url.pathname==='/enqueue'&&request.method==='POST'){const tasks=await request.json() as Task[],queue=await this.state.storage.get<Task[]>('queue')??[],keys=new Set(queue.map(t=>t.kind+':'+t.symbol+':'+(t.roleId||''))),candidates=tasks.filter(t=>!keys.has(t.kind+':'+t.symbol+':'+(t.roleId||''))),capacity=Math.max(0,500-queue.length),accepted=candidates.slice(0,capacity),rejectedCapacity=candidates.length-accepted.length;await this.state.storage.put('queue',[...queue,...accepted]);if(accepted.length)await this.state.storage.setAlarm(Date.now()+1000);return json({accepted:accepted.length,skippedDuplicates:tasks.length-candidates.length,rejectedCapacity,queued:queue.length+accepted.length});}
  return json({error:'Not found'},404);
 }
 async alarm():Promise<void>{
  const queue=await this.state.storage.get<Task[]>('queue')??[],batch=queue.splice(0,3);let processed=0,nextDelay=1000;
  for(const task of batch){try{
    await this.env.DB.batch([
     this.env.DB.prepare("INSERT OR REPLACE INTO agent_task_leases(task_id,owner,lease_until,heartbeat_at,attempts) VALUES(?,?,?,?,?)").bind(task.id,this.state.id.toString(),Date.now()+30_000,Date.now(),task.attempts??0),
     this.env.DB.prepare("UPDATE agent_tasks SET status='running',updated_at=? WHERE id=?").bind(Date.now(),task.id)
    ]);
    if(task.kind==='market-scan'){
     const result=await runMarketScan(this.env,task.symbol);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'market:Market Data Intelligence','market-scan','completed',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='institutional-scan'){
     const bundle=await marketBundle(this.env,task.symbol),raw=await getJson<Kline[]>(binance(this.env)+'/api/v3/klines?symbol='+encodeURIComponent(task.symbol)+'&interval=1m&limit=120');
     const candles=raw.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
     const trades=(bundle.book.trades??[]).filter((t):t is {price:number;quantity:number;aggressor:'buy'|'sell';timestamp:number}=>t.aggressor==='buy'||t.aggressor==='sell');
     const analysis=analyseInstitutionalMarket({symbol:task.symbol,observedAt:bundle.observedAt,price:bundle.lastPrice,candles,book:bundle.book,trades}),analysisId=uuid(),createdAt=Date.now();
     const roleTasks=analysis.findings.map(f=>({id:uuid(),kind:'institutional-role' as const,symbol:task.symbol,createdAt,roleId:'institutional:'+f.agent,correlationId:analysisId,payload:f}));
     if(queue.length+roleTasks.length>500)throw new Error('Durable task queue capacity reached; institutional scan deferred');
     await this.env.DB.batch([
      this.env.DB.prepare('INSERT INTO institutional_analyses(analysis_id,symbol,observed_at,source,result_json) VALUES(?,?,?,?,?)').bind(analysisId,task.symbol,createdAt,'Binance Spot public REST scheduled scan',JSON.stringify(analysis)),
      ...roleTasks.map(t=>this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'queued',?,?,?,NULL)").bind(t.id,t.roleId,'institutional-role-analysis',createdAt,createdAt,JSON.stringify({symbol:task.symbol,analysisId,roleId:t.roleId,finding:t.payload})))
     ]);
     queue.push(...roleTasks);
     await this.env.DB.prepare("UPDATE agent_tasks SET status='completed',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify({analysisId,roleTasks:roleTasks.length}),task.id).run();
     await audit(this.env,'institutional.scheduled.scan.completed','institutional-intelligence-engine',{analysisId,symbol:task.symbol,roleTasks:roleTasks.length});
    }else if(task.kind==='institutional-role'&&task.roleId&&task.correlationId){
     const finding=task.payload,rt:RuntimeTask={id:task.id,roleId:task.roleId,departmentId:'institutional',kind:'institutional-role-analysis',symbol:task.symbol,correlationId:task.correlationId,createdAt:task.createdAt,attempts:task.attempts??0,payload:{finding}};
     const evidence=handlerForInstitutionalFinding(finding,rt);
     await this.env.DB.batch([
      this.env.DB.prepare('INSERT OR REPLACE INTO agent_evidence(evidence_id,correlation_id,role_id,observed_at,expires_at,confidence,stance,evidence_json) VALUES(?,?,?,?,?,?,?,?)').bind(evidence.id,task.correlationId,task.roleId,evidence.observedAt,evidence.expiresAt,evidence.confidence,evidence.stance,JSON.stringify(evidence)),
      this.env.DB.prepare("UPDATE agent_tasks SET status='completed',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify(evidence),task.id),
      this.env.DB.prepare("INSERT INTO agent_messages(message_id,correlation_id,from_role,to_role,message_type,created_at,payload_json) VALUES(?,?,?,?,?,?,?)").bind(uuid(),task.correlationId,task.roleId,'institutional:supervisor','evidence.submitted',Date.now(),JSON.stringify(evidence)),
      this.env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,0,'COMPLETED',?,NULL,?) ON CONFLICT(role_id) DO UPDATE SET enabled=0,status='COMPLETED',heartbeat_at=excluded.heartbeat_at,last_error=NULL,updated_at=excluded.updated_at").bind(task.roleId,Date.now(),Date.now())
     ]);
     const rows=await this.env.DB.prepare('SELECT evidence_json FROM agent_evidence WHERE correlation_id=? AND expires_at>?').bind(task.correlationId,Date.now()).all<any>();
     if(rows.results.length>=10){
      const evidenceRows=rows.results.map((r:any)=>JSON.parse(r.evidence_json) as RuntimeEvidence),decision=arbitrateRuntimeEvidence(evidenceRows,Date.now());
      const stored=await this.env.DB.prepare('SELECT result_json FROM institutional_analyses WHERE analysis_id=?').bind(task.correlationId).first<any>();
      const analysis=stored?JSON.parse(stored.result_json):null;
      const nearest=analysis?.entryZones?.[0]??null,entry=nearest?.mid??null;
      const stop=entry!==null?entry*(decision.stance==='bearish'?1.003:.997):null,target=entry!==null?entry+(decision.stance==='bearish'?-1:1)*Math.abs(entry-(stop??entry))*2:null;
      const workflow=analysis?planAutonomousPaperWorkflow({analysis,runtimeDecision:decision,strategyValidated:false,multiTimeframeAligned:false,marketDataFresh:true,executionEconomicsValid:false,capitalApproved:false,entry,stop,target}):{ready:false,mode:'paper-only',liveExecutionEnabled:false,entry:null,stop:null,target:null,reasons:['Persisted institutional analysis unavailable']};
      await this.env.DB.prepare("INSERT OR IGNORE INTO paper_strategy_runs(run_id,symbol,strategy_id,status,started_at,completed_at,analysis_json,decision_json) VALUES(?,?,?,'analysis-only',?,?,?,?)").bind(task.correlationId,task.symbol,'institutional-evidence-arbitration',task.createdAt,Date.now(),JSON.stringify({correlationId:task.correlationId,evidenceCount:evidenceRows.length,analysisId:task.correlationId}),JSON.stringify({...decision,workflow,approved:false,liveTradingEnabled:false})).run();
      await this.env.DB.prepare("INSERT INTO agent_messages(message_id,correlation_id,from_role,to_role,message_type,created_at,payload_json) VALUES(?,?,?,?,?,?,?)").bind(uuid(),task.correlationId,'institutional:supervisor','paper-strategy-workflow','supervisor.decision',Date.now(),JSON.stringify(decision)).run();
     }
    }else throw new Error('Unsupported or malformed runtime task');
    await this.env.DB.prepare('DELETE FROM agent_task_leases WHERE task_id=?').bind(task.id).run();
    processed++;
  }catch(error){
    await this.env.DB.prepare('DELETE FROM agent_task_leases WHERE task_id=?').bind(task.id).run();
    const attempts=(task.attempts??0)+1,message=String(error);
    await this.state.storage.put('lastError',message);
    if(attempts<3){queue.push({...task,attempts});nextDelay=Math.max(nextDelay,1000*2**attempts);await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,task.roleId??'market:Market Data Intelligence',task.kind, 'retrying',task.createdAt,Date.now(),JSON.stringify({...task,attempts}),JSON.stringify({error:message,attempts})).run();}
    else await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,task.roleId??'market:Market Data Intelligence',task.kind,'failed',task.createdAt,Date.now(),JSON.stringify({...task,attempts}),JSON.stringify({error:message,attempts})).run();
  }}
  await this.state.storage.put('queue',queue);await this.state.storage.put('lastProcessedAt',Date.now());await this.state.storage.put('processedCount',(await this.state.storage.get<number>('processedCount')??0)+processed);if(queue.length)await this.state.storage.setAlarm(Date.now()+nextDelay);
 }
}
