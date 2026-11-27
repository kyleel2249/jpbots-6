import { allAgentRoles, departments, platformServices } from '../src/departments';
import { fetchMarketTickers } from '../src/market-feed';
import { buildScheduledScannerTasks, SCANNER_TASKS_PER_ALARM } from '../src/scanner-scheduler';
import { analyseMarketChart, scoreGlobalOpportunity } from '../src/global-market-intelligence';
import { buildMarketReport, evaluateIntegratedOpportunity, monteCarloRisk } from '../src/intelligence';
import { runEmaBacktest } from '../src/backtesting';
import type { Snapshot } from '../src/intelligence';
import { analyseOrderBook, capitalAuthority, defaultCapitalPolicy } from '../src/shared-services';
import type { Evidence, OrderBookSnapshot, CapitalState } from '../src/shared-services';
import { planPaperLongEntry, planPaperLongExit } from '../src/paper-trading';
import { runDepartmentCouncil, type WorkersAiBinding } from '../src/agent-runtime';
import { analyseInstitutionalMarket } from '../src/institutional-intelligence';
import { analyseAmdSession } from '../src/amd-session-strategy';
import { replayAmdSessions, amdCostSensitivity, optimiseAmdParameters, walkForwardAmd, buildAmdForwardRecord, type AmdValidationConfig } from '../src/amd-validation';
import { buildInstitutionalTradePlan, replayInstitutionalStrategy, walkForwardInstitutionalStrategy, defaultInstitutionalStrategyConfig, type Timeframes } from '../src/institutional-strategy';
import { arbitrateRuntimeEvidence, handlerForInstitutionalFinding, planAutonomousPaperWorkflow, type RuntimeTask, type RuntimeEvidence } from '../src/autonomous-runtime';
import { assessAdvancedMarket } from '../src/advanced-intelligence';
import { evaluateAdaptiveTrading, DEFAULT_DIVISION_POLICIES, type MarketEvidence, type TradingDivision, type DivisionPolicy } from '../src/adaptive-trading';
import { buildDivisionMarketEvidence, buildLongPaperLevels } from '../src/adaptive-division-runtime';
import { assessDerivatives, type DerivativesSnapshot } from '../src/derivatives-intelligence';
import { synchroniseExchanges, buildLiquidityMap, analyseLiquidations, buildSpecialistDebate, adversarialStrategyTest, evolveStrategies, calculatePortfolioRisk, simulateSmartExecution, makeDecisionEvent, verifyDecisionReplay, recoverAgentState, scoreStrategyGenome, type ExchangeQuote, type DerivativePoint } from '../src/predictive-liquidity-engine';

interface D1Result { success:boolean; results?:any[]; meta?:any }
interface D1Statement { bind(...values:any[]):D1Statement; run():Promise<D1Result>; all<T=any>():Promise<{results:T[]}>; first<T=any>():Promise<T|null> }
interface D1Database { prepare(sql:string):D1Statement; batch(statements:D1Statement[]):Promise<D1Result[]> }
interface DurableStorage { get<T=any>(key:string):Promise<T|undefined>; put(key:string,value:any):Promise<void>; setAlarm(time:number):Promise<void>; delete(key:string):Promise<boolean> }
interface DurableState { storage:DurableStorage; id:{toString():string} }
interface DurableId { toString():string }
interface DurableNamespace { idFromName(name:string):DurableId; get(id:DurableId):{fetch(input:Request|string,init?:RequestInit):Promise<Response>} }
type KVBinding={put(key:string,value:string,options?:{expirationTtl?:number;expiration?:number;metadata?:unknown}):Promise<void>;get(key:string):Promise<string|null>;delete(key:string):Promise<void>};
interface Env { DB:D1Database; KV_BINDING:KVBinding; ORCHESTRATOR:DurableNamespace; BINANCE_BASE_URL?:string; DEXSCREENER_BASE_URL?:string; AI?:WorkersAiBinding; AI_ENABLED?:string; AI_MODEL?:string; LLM_API_KEYS?:string; OPERATOR_API_TOKEN?:string; AUTO_PAPER_ENABLED?:string; AMD_PAPER_FORWARD_ENABLED?:string; AMD_SESSION_TIMEZONE?:string; TWELVEDATA_API_KEY?:string }
type Kline=[number,string,string,string,string,string,number,string,string,string,string,string];
type Task={id:string;kind:'market-scan'|'institutional-role'|'institutional-scan'|'institutional-strategy-scan'|'amd-forward-scan'|'global-market-scan'|'adaptive-division-scan'|'division-position-monitor';symbol:string;createdAt:number;attempts?:number;roleId?:string;correlationId?:string;payload?:any};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
type LlmKeyConfig={baseUrl:string;apiKey:string;model:string};
function configuredLlmKeys(raw?:string):LlmKeyConfig[]{if(!raw)return[];try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return[];return parsed.slice(0,5).filter((x:any)=>typeof x?.baseUrl==='string'&&/^https:\/\//.test(x.baseUrl)&&typeof x.apiKey==='string'&&x.apiKey.length>=16&&typeof x.model==='string').map((x:any)=>({baseUrl:x.baseUrl.replace(/\/$/,''),apiKey:x.apiKey,model:x.model}));}catch{return[];}}
function llmBinding(env:Env):WorkersAiBinding|null{const keys=configuredLlmKeys(env.LLM_API_KEYS);if(!keys.length&&!env.AI)return null;return {run:async(model,input)=>{const errors:string[]=[];for(let i=0;i<keys.length;i++){const key=keys[i];try{const response=await fetch(key.baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key.apiKey,'content-type':'application/json'},body:JSON.stringify({model:key.model,messages:input.messages,temperature:input.temperature,max_tokens:input.max_tokens}),signal:AbortSignal.timeout(20000)});if(!response.ok){errors.push('LLM key slot '+(i+1)+' HTTP '+response.status);continue;}const payload=await response.json();if(payload?.choices?.[0]?.message?.content)return payload;errors.push('LLM key slot '+(i+1)+' returned no content');}catch(error){errors.push('LLM key slot '+(i+1)+' failed: '+String(error));}}if(env.AI){try{return await env.AI.run(model,input);}catch(error){errors.push('Workers AI fallback failed: '+String(error));}}throw new Error(errors.join('; ')||'No LLM provider configured');}};}
const operatorAuthorized=(request:Request,env:Env)=>!!env.OPERATOR_API_TOKEN&&request.headers.get('authorization')==='Bearer '+env.OPERATOR_API_TOKEN;
const cors=(response:Response)=>{const h=new Headers(response.headers);h.set('access-control-allow-origin','*');h.set('access-control-allow-methods','GET,POST,OPTIONS');h.set('access-control-allow-headers','content-type,authorization');return new Response(response.body,{status:response.status,headers:h});};
const uuid=()=>crypto.randomUUID();
const binance=(env:Env)=> (env.BINANCE_BASE_URL||'https://data-api.binance.vision').replace(/\/$/,'');
const dexscreener=(env:Env)=>(env.DEXSCREENER_BASE_URL||'https://api.dexscreener.com').replace(/\/$/,'');
async function getJson<T>(url:string):Promise<T>{const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error('Provider returned HTTP '+response.status);return response.json() as Promise<T>;}
async function audit(env:Env,type:string,actor:string,payload:unknown){await env.DB.prepare('INSERT INTO audit_events(id,event_type,actor,created_at,payload_json) VALUES(?,?,?,?,?)').bind(uuid(),type,actor,Date.now(),JSON.stringify(payload)).run();}
function ema(values:number[],period:number){if(values.length<period)return null;const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;for(const x of values.slice(period))v=x*k+v*(1-k);return v;}
function rsi(values:number[],period=14){if(values.length<=period)return null;let gains=0,losses=0;for(let i=values.length-period;i<values.length;i++){const delta=values[i]-values[i-1];if(delta>0)gains+=delta;else losses-=delta;}if(losses===0)return 100;const rs=(gains/period)/(losses/period);return 100-100/(1+rs);}
async function getCapital(env:Env):Promise<CapitalState>{const row=await env.DB.prepare("SELECT * FROM portfolio_accounts WHERE account_id='primary'").first<any>();return {equity:row?.equity??0,peakEquity:row?.peak_equity??0,dailyLossPct:row?.daily_loss_pct??0,weeklyLossPct:row?.weekly_loss_pct??0,monthlyLossPct:row?.monthly_loss_pct??0,openPositions:row?.open_positions??0,correlatedExposurePct:row?.correlated_exposure_pct??0,leverage:row?.leverage??0,marginUtilisationPct:row?.margin_utilisation_pct??0,exchangeHealthy:true,dataFresh:true,accountReconciled:row?.reconciled===1};}
async function loadDerivatives(symbol:string):Promise<DerivativesSnapshot|null>{
 const base='https://fapi.binance.com';
 try{
  const [premiumResponse,interestResponse]=await Promise.all([
   fetch(base+'/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol),{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)}),
   fetch(base+'/fapi/v1/openInterest?symbol='+encodeURIComponent(symbol),{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)})
  ]);
  if(!premiumResponse.ok||!interestResponse.ok)return null;
  const [premium,interest]=await Promise.all([premiumResponse.json() as Promise<any>,interestResponse.json() as Promise<any>]);
  const snapshot:DerivativesSnapshot={observedAt:Number(premium.time),fundingRate:Number(premium.lastFundingRate),nextFundingTime:Number(premium.nextFundingTime),markPrice:Number(premium.markPrice),indexPrice:Number(premium.indexPrice),openInterest:Number(interest.openInterest),openInterestTime:Number(interest.time)};
  return Object.values(snapshot).every(v=>Number.isFinite(v))?snapshot:null;
 }catch{return null;}
}
async function loadPredictiveDerivatives(symbol:string):Promise<{points:DerivativePoint[];source:string|null}>{
 try{
  const base='https://fapi.binance.com';
  const [fundingResponse,oiResponse]=await Promise.all([
   fetch(base+'/fapi/v1/fundingRate?symbol='+encodeURIComponent(symbol)+'&limit=100',{signal:AbortSignal.timeout(5000)}),
   fetch(base+'/futures/data/openInterestHist?symbol='+encodeURIComponent(symbol)+'&period=5m&limit=30',{signal:AbortSignal.timeout(5000)})
  ]);
  if(!fundingResponse.ok||!oiResponse.ok)return {points:[],source:null};
  const [funding,oi]=await Promise.all([fundingResponse.json() as Promise<any[]>,oiResponse.json() as Promise<any[]>]);
  const points:DerivativePoint[]=[];
  for(const row of oi){const at=Number(row.timestamp),oiValue=Number(row.sumOpenInterest);const fr=funding.filter((x:any)=>Number(x.fundingTime)<=at).at(-1);if(Number.isFinite(at)&&Number.isFinite(oiValue)&&oiValue>=0&&fr){points.push({observedAt:at,fundingRate:Number(fr.fundingRate),openInterest:oiValue});}}
  return {points,source:'Binance USD-M Futures public fundingRate + openInterestHist'};
 }catch{return {points:[],source:null};}
}
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
 if(!exit.valid||exit.averageExitPrice===null){await env.DB.prepare("UPDATE paper_positions SET status='open',closing_since=NULL WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,errors:exit.errors};}
 const account=await getPaperAccount(env);if(!account){await env.DB.prepare("UPDATE paper_positions SET status='open',closing_since=NULL WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,reason:'paper account unavailable'};}
 const equityBefore=Number(account.equity),equityAfter=equityBefore+exit.netPnl,peak=Math.max(Number(account.peak_equity),equityAfter);
 const dayKey=new Date(now).toISOString().slice(0,10),weekKey=paperWeekKey(now),monthKey=dayKey.slice(0,7);
 const dayStart=account.day_key===dayKey&&Number(account.day_start_equity)>0?Number(account.day_start_equity):equityBefore;
 const weekStart=account.week_key===weekKey&&Number(account.week_start_equity)>0?Number(account.week_start_equity):equityBefore;
 const monthStart=account.month_key===monthKey&&Number(account.month_start_equity)>0?Number(account.month_start_equity):equityBefore;
 const loss=(start:number)=>start>0?Math.max(0,(start-equityAfter)/start*100):100;
 const openPositions=Math.max(0,Number(account.open_positions)-1),fillId=uuid();
 await env.DB.batch([
  env.DB.prepare("UPDATE paper_positions SET status='closed',closing_since=NULL,closed_at=?,exit_price=?,exit_fee=?,gross_pnl=?,net_pnl=?,exit_reason=? WHERE position_id=? AND status='closing'").bind(now,exit.averageExitPrice,exit.exitFee,exit.grossPnl,exit.netPnl,reason,position.position_id),
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

async function runInstitutionalStrategyWorkflow(env:Env,symbol:string,autoPaperRequested:boolean){
 const intervals=['5m','15m','1h','4h'] as const;
 const fetched=await Promise.all(intervals.map(async interval=>{
  const raw=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=1000');
  return raw.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])})).filter(c=>c.closeTime<=Date.now());
 }));
 const tf:Timeframes={'5m':fetched[0],'15m':fetched[1],'1h':fetched[2],'4h':fetched[3]},account=await getPaperAccount(env),equity=Number(account?.equity??0);
 const config={...defaultInstitutionalStrategyConfig,riskPct:defaultInstitutionalStrategyConfig.riskPct};
 const plan=buildInstitutionalTradePlan(tf,equity,config,Date.now());
 const amdSession=analyseAmdSession(tf['5m'],Date.now(),env.AMD_SESSION_TIMEZONE||'UTC');
 const replay=replayInstitutionalStrategy(tf['5m'],{'15m':tf['15m'],'1h':tf['1h'],'4h':tf['4h']},config,10000);
 const walkForward=walkForwardInstitutionalStrategy(tf['5m'],{'15m':tf['15m'],'1h':tf['1h'],'4h':tf['4h']},config,10000,4);
 const oos=walkForward.outOfSample?.metrics??null,returns=(replay.valid?replay.trades:[]).map(t=>t.netPct),monteCarlo=monteCarloRisk(returns,2000,100,42),costSensitivity=[0,5,10].map(extraBps=>{const scenario=replayInstitutionalStrategy(tf['5m'],{'15m':tf['15m'],'1h':tf['1h'],'4h':tf['4h']},{...config,slippageBps:config.slippageBps+extraBps},10000);return {extraSlippageBps:extraBps,metrics:scenario.metrics};}),qualification={status:'research-only',liveExecutionEnabled:false,checks:{replayValid:replay.valid,walkForwardValid:walkForward.valid,minimumReplayTrades:(replay.metrics?.tradeCount??0)>=100,minimumOosTrades:(oos?.tradeCount??0)>=50,positiveOosExpectancy:(oos?.expectancy??0)>0,drawdownWithinPolicy:(oos?.maxDrawdownPct??100)<=5},reasons:[] as string[]};
 for(const [key,passed] of Object.entries(qualification.checks))if(!passed)qualification.reasons.push(key+' not satisfied');
 const runId=uuid(),createdAt=Date.now();let paperExecution:any={attempted:false,opened:false,reason:'Automatic paper entry not requested'};
 if(autoPaperRequested){
  if(env.AUTO_PAPER_ENABLED!=='true')paperExecution={attempted:false,opened:false,reason:'Automatic paper entries are disabled by the AUTO_PAPER_ENABLED safety switch'};
  else{
   const current=await marketBundle(env,symbol),nearPlan=plan.entry!==null&&Math.abs(current.book.mid-plan.entry)/plan.entry<=.0015,geometry=plan.stop!==null&&plan.target!==null&&plan.stop<current.book.mid&&current.book.mid<plan.target;
   if(!amdSession.qualified)paperExecution={attempted:false,opened:false,reason:'AMD session gate rejected entry: '+amdSession.reason.join('; '),phase:amdSession.phase};
   else if(amdSession.direction!==(plan.side==='long'?'bullish':plan.side==='short'?'bearish':'neutral'))paperExecution={attempted:false,opened:false,reason:'AMD direction does not agree with the independently validated multi-timeframe strategy',amdDirection:amdSession.direction,strategyDirection:plan.side};
   else if(!plan.valid||plan.side!=='long')paperExecution={attempted:false,opened:false,reason:'No valid long institutional setup; paper engine currently supports Spot-long only',blockers:plan.reasons};
   else if(!nearPlan||!geometry)paperExecution={attempted:false,opened:false,reason:'Current executable price is not sufficiently close to the planned entry or violates stop/target geometry'};
   else{const order=await createPaperOrder(env,{symbol,stopPrice:plan.stop,targetPrice:plan.target,riskPct:config.riskPct,feeBps:config.feeBps,strategy:'institutional-mtf-v1'});paperExecution={attempted:true,opened:!!order.position,...order};}
  }
 }
 const result={runId,symbol,createdAt,source:'Binance Spot historical OHLCV',amdSession,timeframes:Object.fromEntries(intervals.map(k=>[k,{candles:tf[k].length,lastClose:tf[k].at(-1)?.close}])),plan,replay:replay.valid?{metrics:replay.metrics,trades:replay.trades.slice(-100)}:{errors:replay.errors},walkForward,monteCarlo,costSensitivity,qualification,paperExecution,liveExecutionEnabled:false,report:'The engine checked four timeframes, built a structure-based entry/stop/target proposal, replayed historical candles with conservative stop-first handling when stop and target are touched in the same candle, and evaluated rolling walk-forward windows plus a final untouched out-of-sample segment. This is research evidence, not a live-trading authorisation.'};
 await env.DB.prepare('INSERT INTO institutional_strategy_runs(run_id,symbol,mode,strategy_version,created_at,result_json,qualification_json) VALUES(?,?,?,?,?,?,?)').bind(runId,symbol,autoPaperRequested?'automatic-paper':'analysis','institutional-mtf-v1',createdAt,JSON.stringify(result),JSON.stringify(qualification)).run();
 await env.DB.batch(Object.entries(qualification.checks).map(([stage,passed])=>env.DB.prepare('INSERT INTO strategy_qualification_evidence(evidence_id,strategy_id,version,stage,passed,metrics_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(uuid(),'institutional-mtf','1.0.0',stage,passed?1:0,JSON.stringify({runId,replay:replay.metrics,oos,walkForward:walkForward.aggregate}),createdAt)));
 await env.KV_BINDING.put('institutional:latest:'+symbol,JSON.stringify({runId,createdAt,qualification,plan,amdSession,summary:result.report}),{expirationTtl:86400});
 await audit(env,'institutional.strategy.completed','institutional-mtf-strategy-engine',{runId,symbol,valid:plan.valid,autoPaperRequested,paperOpened:paperExecution.opened===true,qualification});
 return result;
}
async function fetchAmdHistory(env:Env,symbol:string,days:number){
 const intervalMs=300_000,now=Date.now(),boundedDays=Math.max(1,Math.min(60,Math.floor(days))),start=now-boundedDays*86_400_000,rows:Kline[]=[];let cursor=start;
 for(let page=0;page<19&&cursor<now;page++){
  const batch=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval=5m&limit=1000&startTime='+cursor+'&endTime='+now);
  if(!batch.length)break;rows.push(...batch);const next=Number(batch[batch.length-1][0])+intervalMs;if(next<=cursor)throw new Error('Historical candle pagination did not advance');cursor=next;if(batch.length<1000)break;
 }
 const candles=rows.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])})).filter(c=>c.closeTime<now);
 return candles;
}
async function saveAmdValidation(env:Env,symbol:string,runType:'replay'|'optimisation'|'walk-forward',config:unknown,result:unknown,metrics:unknown){
 const runId=uuid(),now=Date.now();await env.DB.prepare('INSERT INTO amd_validation_runs(run_id,symbol,run_type,strategy_version,started_at,completed_at,config_json,metrics_json,result_json) VALUES(?,?,?,?,?,?,?,?,?)').bind(runId,symbol,runType,'amd-session-v2',now,now,JSON.stringify(config),JSON.stringify(metrics),JSON.stringify(result)).run();await audit(env,'amd.validation.completed','amd-validation-engine',{runId,symbol,runType});return runId;
}
async function runAmdForwardScan(env:Env,symbol:string){
 const intervals=['5m','15m','1h','4h'] as const,limits=[500,300,200,100];
 const fetched=await Promise.all(intervals.map(async(interval,i)=>{const raw=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit='+limits[i]);return raw.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])})).filter(c=>c.closeTime<Date.now());}));
 const tf:Timeframes={'5m':fetched[0],'15m':fetched[1],'1h':fetched[2],'4h':fetched[3]},now=Date.now(),assessment=analyseAmdSession(tf['5m'],now,env.AMD_SESSION_TIMEZONE||'UTC');
 const last=tf['5m'].at(-1);if(!last)return {recorded:false,reason:'No closed 5m candle available'};
 const account=await getPaperAccount(env),plan=buildInstitutionalTradePlan(tf,Number(account?.equity??0),defaultInstitutionalStrategyConfig,now);
 const record=buildAmdForwardRecord({symbol,assessment,observedAt:last.closeTime,strategy:{valid:plan.valid,side:plan.side,confidence:plan.confidence},paperEnabled:env.AMD_PAPER_FORWARD_ENABLED==='true'&&env.AUTO_PAPER_ENABLED==='true'});
 let paperOrderAttempted=false,paperOpened=false,paperExecution:any=null;
 const paperEnabled=env.AMD_PAPER_FORWARD_ENABLED==='true'&&env.AUTO_PAPER_ENABLED==='true';
 if(paperEnabled&&assessment.qualified&&record.arbitration?.approved){
  if(plan.side!=='long')paperExecution={opened:false,reason:'Current paper engine supports Spot-long only; bearish AMD opportunities remain recorded but are not executed'};
  else{
   const lease=await env.DB.prepare("INSERT INTO amd_paper_session_locks(symbol,session_date,state,lease_until,position_id,updated_at) VALUES(?,?,'reserved',?,NULL,?) ON CONFLICT(symbol,session_date) DO UPDATE SET state='reserved',lease_until=excluded.lease_until,position_id=NULL,updated_at=excluded.updated_at WHERE amd_paper_session_locks.state='failed' OR (amd_paper_session_locks.state='reserved' AND amd_paper_session_locks.lease_until<?)").bind(symbol,assessment.sessionDate,now+120000,now,now).run();
   if(Number(lease.meta?.changes??0)!==1)paperExecution={opened:false,reason:'An AMD paper entry is already open or reserved for this symbol and session'};
   else{
    try{
     const current=await marketBundle(env,symbol),nearPlan=plan.entry!==null&&Math.abs(current.book.mid-plan.entry)/plan.entry<=.0015,geometry=plan.stop!==null&&plan.target!==null&&plan.stop<current.book.mid&&current.book.mid<plan.target;
     if(!nearPlan||!geometry)paperExecution={opened:false,reason:'Executable price is not near the independently validated entry or stop/target geometry is invalid'};
     else{paperOrderAttempted=true;const order=await createPaperOrder(env,{symbol,stopPrice:plan.stop,targetPrice:plan.target,riskPct:defaultInstitutionalStrategyConfig.riskPct,feeBps:defaultInstitutionalStrategyConfig.feeBps,strategy:'amd-forward-v1'});paperOpened=!!order.position;paperExecution={...order,opened:paperOpened};}
     await env.DB.prepare("UPDATE amd_paper_session_locks SET state=?,lease_until=?,position_id=?,updated_at=? WHERE symbol=? AND session_date=? AND state='reserved'").bind(paperOpened?'opened':'failed',paperOpened?Number.MAX_SAFE_INTEGER:now,paperOpened?String(paperExecution.position?.positionId??''):null,Date.now(),symbol,assessment.sessionDate).run();
    }catch(error){await env.DB.prepare("UPDATE amd_paper_session_locks SET state='failed',lease_until=?,updated_at=? WHERE symbol=? AND session_date=? AND state='reserved'").bind(now,Date.now(),symbol,assessment.sessionDate).run();paperExecution={opened:false,reason:'AMD paper execution failed: '+String(error)};}
   }
  }
 }
 const status=paperOpened?'paper-opened':!assessment.qualified||record.arbitration&&!record.arbitration.approved?'rejected':'missed',reasons=[...record.reason,...(paperExecution?.reason?[paperExecution.reason]:[])];
 const dedupeKey=[symbol,assessment.sessionDate,last.closeTime].join(':');
 const result=await env.DB.prepare('INSERT OR IGNORE INTO amd_forward_opportunities(opportunity_id,symbol,session_date,observed_at,phase,status,direction,dedupe_key,reason_json,assessment_json,arbitration_json,paper_order_attempted,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid(),symbol,record.sessionDate,record.observedAt,record.phase,status,record.direction,dedupeKey,JSON.stringify(reasons),JSON.stringify({amd:assessment,strategyPlan:plan,paperExecution}),record.arbitration?JSON.stringify(record.arbitration):null,paperOrderAttempted?1:0,now).run();
 if(Number(result.meta?.changes??0)===1)await audit(env,'amd.forward.opportunity.recorded','amd-forward-observer',{symbol,sessionDate:record.sessionDate,observedAt:record.observedAt,status,direction:record.direction,paperOrderAttempted,paperOpened});
 return {...record,status,reason:reasons,paperOrderAttempted,paperOpened,paperExecution,recorded:Number(result.meta?.changes??0)===1,dedupeKey};
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
type GlobalAssetClass='crypto-spot'|'crypto-perpetual'|'forex-reference'|'equity'|'index'|'commodity'|'dex-pool'|'onchain-network';
type GlobalInstrument={id:string;symbol:string;name:string;assetClass:GlobalAssetClass;venue:string;chain?:string;quote?:string;price?:number;change24hPct?:number;volume24hUsd?:number;liquidityUsd?:number;tvlUsd?:number;observedAt:number;source:string;tradable:boolean;metadata?:Record<string,unknown>};
const globalJson=async(url:string)=>{const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error('HTTP '+r.status+' '+new URL(url).hostname);return r.json() as Promise<any>;};
const finite=(x:any)=>x===null||x===undefined||x===''?undefined:Number.isFinite(Number(x))?Number(x):undefined;
const percent=(x:any)=>{const n=finite(x);return n===undefined?undefined:n*100;};
async function ensureDefaultRuntimeAgentAssignments(env:Env,instruments:GlobalInstrument[],opportunities:any[],observedAt:number){
 const best=opportunities.find(x=>x.instrument?.assetClass==='crypto-spot'&&x.instrument?.venue==='Binance Spot')?.instrument??instruments.find(x=>x.assetClass==='crypto-spot'&&x.venue==='Binance Spot'&&x.tradable&&Number(x.price)>0);
 if(!best||!/^[A-Z0-9]{5,20}$/.test(String(best.symbol||'')))return {activated:0,assigned:0,reason:'No eligible Binance Spot instrument'};
 const defaults=allAgentRoles.filter(r=>(r.departmentId==='institutional')||(r.departmentId==='scalp'&&r.name==='Scalping Market Scanner')||(r.departmentId==='day'&&r.name==='Intraday Market Scanner'));
 const bootstrap=await env.KV_BINDING.get('agent-assignment:bootstrap:v1').catch(()=>null);
 if(!bootstrap){await env.DB.batch(defaults.map(r=>env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,1,'ASSIGNED',NULL,NULL,?) ON CONFLICT(role_id) DO UPDATE SET enabled=1,status='ASSIGNED',last_error=NULL,updated_at=excluded.updated_at").bind(r.departmentId+':'+r.name,observedAt)));await env.KV_BINDING.put('agent-assignment:bootstrap:v1','complete');}
 else await env.DB.batch(defaults.map(r=>env.DB.prepare("INSERT OR IGNORE INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,1,'ASSIGNED',NULL,NULL,?)").bind(r.departmentId+':'+r.name,observedAt)));
 const ids=defaults.map(r=>r.departmentId+':'+r.name),states=await env.DB.prepare('SELECT role_id,enabled FROM agent_state WHERE role_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all<any>(),enabled=new Set(states.results.filter((x:any)=>Number(x.enabled)===1).map((x:any)=>String(x.role_id)));
 const active=defaults.filter(r=>enabled.has(r.departmentId+':'+r.name));
 if(active.length)await env.DB.batch(active.map(r=>{const id=r.departmentId+':'+r.name,division=r.departmentId==='scalp'?'scalping':r.departmentId==='day'?'day-trading':'shared',timeframe=r.departmentId==='scalp'?'1m/3m/5m':r.departmentId==='day'?'5m/15m/30m/1h/4h':'MULTI-TIMEFRAME';return env.DB.prepare("INSERT INTO agent_assignments(role_id,division_id,symbol,timeframe,status,assignment_source,assigned_at,updated_at) VALUES(?,?,?,?,'ASSIGNED','global-market-auto-assignment',?,?) ON CONFLICT(role_id) DO UPDATE SET symbol=excluded.symbol,timeframe=excluded.timeframe,status='ASSIGNED',assignment_source=excluded.assignment_source,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at").bind(id,division,best.symbol,timeframe,observedAt,observedAt);}));
 const scalp=enabled.has('scalp:Scalping Market Scanner'),day=enabled.has('day:Intraday Market Scanner');
 await env.DB.batch([
  env.DB.prepare('UPDATE trading_divisions SET enabled=?,updated_at=? WHERE division_id=?').bind(scalp?1:0,observedAt,'scalping'),
  env.DB.prepare('UPDATE trading_divisions SET enabled=?,updated_at=? WHERE division_id=?').bind(day?1:0,observedAt,'day-trading')
 ]);
 return {activated:defaults.filter(r=>!states.results.some((x:any)=>String(x.role_id)===r.departmentId+':'+r.name)).length,assigned:active.length,symbol:best.symbol};
}
async function runGlobalMarketScan(env:Env,maxDeepScan=12){
 const startedAt=Date.now(),runId=uuid(),rows:GlobalInstrument[]=[],sourceHealth:Record<string,any>={};
 try{await env.DB.prepare('INSERT INTO global_market_scan_runs(run_id,started_at,status,discovered_count,scanned_count,source_health_json,summary_json) VALUES(?,?,?,?,?,?,?)').bind(runId,startedAt,'running',0,0,'{}','{}').run();}catch(error){sourceHealth['D1 run history']={status:'unavailable',error:String(error).slice(0,180)};}
 const root=binance(env);
 const [spot,futures,bitgetSpot,bitgetFutures,bybitSpot,bybitLinear,okxSpot,okxSwap,dex,gecko,defi,fx]=await Promise.allSettled([
  (async()=>{const [info,tickers]=await Promise.all([globalJson(root+'/api/v3/exchangeInfo'),globalJson(root+'/api/v3/ticker/24hr')]);const quoteBySymbol=new Map((info.symbols||[]).filter((x:any)=>x.status==='TRADING'&&['USDT','USDC','FDUSD','BTC','ETH'].includes(x.quoteAsset)).map((x:any)=>[x.symbol,x.quoteAsset])),btcUsd=Number((tickers||[]).find((x:any)=>x.symbol==='BTCUSDT')?.lastPrice||0),ethUsd=Number((tickers||[]).find((x:any)=>x.symbol==='ETHUSDT')?.lastPrice||0),quoteUsd:Record<string,number>={USDT:1,USDC:1,FDUSD:1,BTC:btcUsd,ETH:ethUsd};return (tickers||[]).filter((x:any)=>quoteBySymbol.has(x.symbol)).map((x:any)=>({id:'binance-spot:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-spot' as const,venue:'Binance Spot',quote:String(quoteBySymbol.get(x.symbol)),price:finite(x.lastPrice),change24hPct:finite(x.priceChangePercent),volume24hUsd:(()=>{const qv=finite(x.quoteVolume),usd=quoteUsd[String(quoteBySymbol.get(x.symbol))];return qv!==undefined&&usd>0?qv*usd:undefined;})(),observedAt:startedAt,source:'Binance Spot exchangeInfo + 24h ticker',tradable:true})).filter((x:GlobalInstrument)=>!!x.price).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const [info,tickers]=await Promise.all([globalJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),globalJson('https://fapi.binance.com/fapi/v1/ticker/24hr')]);const active=new Set((info.symbols||[]).filter((x:any)=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&['USDT','USDC'].includes(x.quoteAsset)).map((x:any)=>x.symbol));return (tickers||[]).filter((x:any)=>active.has(x.symbol)).map((x:any)=>({id:'binance-perp:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-perpetual' as const,venue:'Binance USD-M Perpetual',quote:'USDT',price:finite(x.lastPrice),change24hPct:finite(x.priceChangePercent),volume24hUsd:finite(x.quoteVolume),observedAt:startedAt,source:'Binance USD-M exchangeInfo + 24h ticker',tradable:true})).filter((x:GlobalInstrument)=>!!x.price).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const p=await globalJson('https://api.bitget.com/api/v2/spot/market/tickers');if(p.code!=='00000')throw new Error(String(p.msg||p.code));return (p.data||[]).filter((x:any)=>Number(x.lastPr)>0).map((x:any)=>({id:'bitget-spot:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-spot' as const,venue:'Bitget Spot',quote:String(x.symbol).match(/(USDT|USDC|BTC|ETH)$/)?.[1],price:finite(x.lastPr),change24hPct:percent(x.changeUtc24h),volume24hUsd:finite(x.usdtVolume),observedAt:startedAt,source:'Bitget public Spot tickers',tradable:true})).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const p=await globalJson('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES');if(p.code!=='00000')throw new Error(String(p.msg||p.code));return (p.data||[]).filter((x:any)=>Number(x.lastPr)>0).map((x:any)=>({id:'bitget-perp:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-perpetual' as const,venue:'Bitget USDT Perpetual',quote:'USDT',price:finite(x.lastPr),change24hPct:percent(x.changeUtc24h),volume24hUsd:finite(x.usdtVolume)||finite(x.quoteVolume),observedAt:startedAt,source:'Bitget public USDT futures tickers',tradable:true})).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const p=await globalJson('https://api.bybit.com/v5/market/tickers?category=spot');if(p.retCode!==0)throw new Error(String(p.retMsg||p.retCode));return (p.result?.list||[]).filter((x:any)=>/(USDT|USDC|BTC|ETH)$/.test(String(x.symbol))&&Number(x.lastPrice)>0).map((x:any)=>({id:'bybit-spot:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-spot' as const,venue:'Bybit Spot',quote:String(x.symbol).match(/(USDT|USDC|BTC|ETH)$/)?.[1],price:finite(x.lastPrice),change24hPct:percent(x.price24hPcnt),volume24hUsd:/USDT$|USDC$/.test(String(x.symbol))?finite(x.turnover24h):undefined,observedAt:startedAt,source:'Bybit public Spot tickers',tradable:true})).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const p=await globalJson('https://api.bybit.com/v5/market/tickers?category=linear');if(p.retCode!==0)throw new Error(String(p.retMsg||p.retCode));return (p.result?.list||[]).filter((x:any)=>String(x.symbol).endsWith('USDT')&&Number(x.lastPrice)>0).map((x:any)=>({id:'bybit-perp:'+x.symbol,symbol:x.symbol,name:x.symbol,assetClass:'crypto-perpetual' as const,venue:'Bybit USDT Linear Perpetual',quote:'USDT',price:finite(x.lastPrice),change24hPct:percent(x.price24hPcnt),volume24hUsd:finite(x.turnover24h),observedAt:startedAt,source:'Bybit public Linear tickers',tradable:true})).sort((a:GlobalInstrument,b:GlobalInstrument)=>(b.volume24hUsd||0)-(a.volume24hUsd||0));})(),
  (async()=>{const p=await globalJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT');if(p.code!=='0')throw new Error(String(p.msg||p.code));return (p.data||[]).filter((x:any)=>/(USDT|USDC|BTC|ETH)$/.test(String(x.instId).split('-').at(-1)||'')&&Number(x.last)>0).map((x:any)=>({id:'okx-spot:'+x.instId,symbol:x.instId.replace(/-/g,''),name:x.instId,assetClass:'crypto-spot' as const,venue:'OKX Spot',quote:String(x.instId).split('-').at(-1),price:finite(x.last),change24hPct:Number(x.open24h)>0?(Number(x.last)/Number(x.open24h)-1)*100:undefined,observedAt:startedAt,source:'OKX public Spot tickers',tradable:true}));})(),
  (async()=>{const p=await globalJson('https://www.okx.com/api/v5/market/tickers?instType=SWAP');if(p.code!=='0')throw new Error(String(p.msg||p.code));return (p.data||[]).filter((x:any)=>/(USDT|USDC)-SWAP$/.test(String(x.instId))&&Number(x.last)>0).map((x:any)=>({id:'okx-swap:'+x.instId,symbol:x.instId.replace(/-/g,''),name:x.instId,assetClass:'crypto-perpetual' as const,venue:'OKX USDT Perpetual',quote:String(x.instId).split('-').at(-2),price:finite(x.last),change24hPct:Number(x.open24h)>0?(Number(x.last)/Number(x.open24h)-1)*100:undefined,observedAt:startedAt,source:'OKX public SWAP tickers',tradable:true}));})(),
  (async()=>{const p=await globalJson((env.DEXSCREENER_BASE_URL||'https://api.dexscreener.com')+'/token-profiles/latest/v1');return (Array.isArray(p)?p:[]).slice(0,150).map((x:any)=>({id:'dex-profile:'+x.chainId+':'+x.tokenAddress,symbol:String(x.tokenAddress).slice(0,10),name:x.description||x.header||'Recently surfaced token',assetClass:'dex-pool' as const,venue:'DexScreener discovery',chain:x.chainId,observedAt:startedAt,source:'DexScreener latest token profiles',tradable:false,metadata:{tokenAddress:x.tokenAddress,url:x.url,icon:x.icon}}));})(),
  (async()=>{const networks=['solana','eth','base','bsc','arbitrum','optimism','polygon_pos','avax'];const results=await Promise.allSettled(networks.map(n=>globalJson('https://api.geckoterminal.com/api/v2/networks/'+n+'/new_pools?page=1')));const out:GlobalInstrument[]=[];results.forEach((r,i)=>{if(r.status!=='fulfilled'){sourceHealth['GeckoTerminal '+networks[i]]={status:'unavailable',error:String(r.reason).slice(0,160)};return;}for(const p of (r.value.data||[]).slice(0,20)){const a=p.attributes||{},id=p.id||'';out.push({id:'gecko:'+id,symbol:String(a.name||id).slice(0,80),name:String(a.name||'DEX pool'),assetClass:'dex-pool',venue:'GeckoTerminal',chain:networks[i],price:finite(a.base_token_price_usd),change24hPct:finite(a.price_change_percentage?.h24),volume24hUsd:finite(a.volume_usd?.h24),liquidityUsd:finite(a.reserve_in_usd),observedAt:startedAt,source:'GeckoTerminal new pools',tradable:false,metadata:{poolAddress:a.address,transactions24h:a.transactions?.h24}});}});return out;})(),
  (async()=>{const p=await globalJson('https://api.llama.fi/v2/chains');return (Array.isArray(p)?p:[]).map((x:any)=>({id:'defillama-chain:'+x.name,symbol:String(x.gecko_id||x.name),name:String(x.name),assetClass:'onchain-network' as const,venue:'DeFiLlama',chain:String(x.name),tvlUsd:finite(x.tvl),observedAt:startedAt,source:'DeFiLlama chain TVL',tradable:false,metadata:{tvl:finite(x.tvl),geckoId:x.gecko_id}}));})(),
  (async()=>{const p=await globalJson('https://api.frankfurter.app/latest?from=USD');return Object.entries(p.rates||{}).map(([currency,rate])=>({id:'fx-reference:USD'+currency,symbol:'USD/'+currency,name:'USD to '+currency,assetClass:'forex-reference' as const,venue:'Frankfurter reference FX',quote:currency,price:finite(rate),observedAt:startedAt,source:'Frankfurter daily reference rates',tradable:false,metadata:{rateDate:p.date,base:'USD'}})).filter((x:GlobalInstrument)=>!!x.price);})()
 ]);
 const names=['Binance Spot','Binance USD-M Perpetual','Bitget Spot','Bitget USDT Perpetual','Bybit Spot','Bybit Linear Perpetual','OKX Spot','OKX USDT Perpetual','DexScreener','GeckoTerminal','DeFiLlama','Forex reference'];
 const settled=[spot,futures,bitgetSpot,bitgetFutures,bybitSpot,bybitLinear,okxSpot,okxSwap,dex,gecko,defi,fx];
 for(let i=0;i<names.length;i++){const r=settled[i];if(r.status==='fulfilled'){rows.push(...r.value);sourceHealth[names[i]]={status:'online',count:r.value.length,observedAt:startedAt};}else sourceHealth[names[i]]={status:'unavailable',count:0,error:String(r.reason).slice(0,240),observedAt:startedAt};}
 if(env.TWELVEDATA_API_KEY){const symbols=['AAPL','MSFT','NVDA','AMZN','TSLA','GOOGL','SPX','NDX','DJI','EUR/USD','GBP/USD','USD/JPY','XAU/USD','XAG/USD','WTI/USD'],offset=Math.floor(startedAt/900000)%symbols.length,rotated=[...symbols.slice(offset),...symbols.slice(0,offset)].slice(0,6);const quotes=await Promise.allSettled(rotated.map(async symbol=>{const p=await globalJson('https://api.twelvedata.com/quote?symbol='+encodeURIComponent(symbol)+'&apikey='+encodeURIComponent(env.TWELVEDATA_API_KEY!));if(p.status==='error'||!p.close)throw new Error(String(p.message||p.code||'No quote'));return {id:'twelvedata:'+symbol,symbol,name:String(p.name||symbol),assetClass:(symbol.includes('/')?(symbol.includes('XAU')||symbol.includes('XAG')||symbol.includes('WTI')?'commodity':'forex-reference'):['SPX','NDX','DJI'].includes(symbol)?'index':'equity') as GlobalAssetClass,venue:String(p.exchange||'Twelve Data'),price:finite(p.close),change24hPct:finite(p.percent_change),volume24hUsd:finite(p.volume),observedAt:startedAt,source:'Twelve Data quote API',tradable:false,metadata:{timestamp:p.datetime,previousClose:p.previous_close}} as GlobalInstrument;}));for(const q of quotes)if(q.status==='fulfilled')rows.push(q.value);sourceHealth['Twelve Data']={status:quotes.some(x=>x.status==='fulfilled')?'online':'degraded',count:quotes.filter(x=>x.status==='fulfilled').length,configured:true};}
 else sourceHealth['Twelve Data']={status:'not-configured',count:0,configured:false,requiredFor:'Equities, indices, commodities and intraday FX quotes'};
 const unique=new Map<string,GlobalInstrument>();for(const row of rows)if(row.id&&row.symbol)unique.set(row.id,row);
 const instruments=[...unique.values()],spotCandidates=instruments.filter(x=>x.venue==='Binance Spot').slice(0,Math.min(8,Math.max(1,maxDeepScan))),futuresCandidates=instruments.filter(x=>x.venue==='Binance USD-M Perpetual').slice(0,Math.min(4,Math.max(1,Math.floor(maxDeepScan/2)))),deep=[...spotCandidates,...futuresCandidates],charts:Record<string,any>={};
 await Promise.all(deep.map(async instrument=>{try{const isFuture=instrument.assetClass==='crypto-perpetual',url=isFuture?'https://fapi.binance.com/fapi/v1/klines?symbol='+encodeURIComponent(instrument.symbol)+'&interval=5m&limit=100':'https://data-api.binance.vision/api/v3/klines?symbol='+encodeURIComponent(instrument.symbol)+'&interval=5m&limit=100',raw=await globalJson(url),candles=raw.map((k:any)=>({openTime:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:Number(k[6])})).filter((x:any)=>x.closeTime<startedAt);charts[instrument.id]=analyseMarketChart(candles);}catch(e){charts[instrument.id]={error:String(e).slice(0,160)};}}));
 const mtfCandidates=deep.slice(0,4);
 await Promise.all(mtfCandidates.map(async instrument=>{try{const isFuture=instrument.assetClass==='crypto-perpetual',url=isFuture?'https://fapi.binance.com/fapi/v1/klines?symbol='+encodeURIComponent(instrument.symbol)+'&interval=1h&limit=100':'https://data-api.binance.vision/api/v3/klines?symbol='+encodeURIComponent(instrument.symbol)+'&interval=1h&limit=100',raw=await globalJson(url),candles=raw.map((k:any)=>({openTime:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:Number(k[6])})).filter((x:any)=>x.closeTime<startedAt),higher=analyseMarketChart(candles),lower=charts[instrument.id];charts[instrument.id]={...lower,timeframes:{'5m':lower,'1h':higher},multiTimeframeAligned:!!lower&&lower.trend===higher.trend&&lower.trend!=='sideways'};}catch(e){charts[instrument.id]={...charts[instrument.id],higherTimeframeError:String(e).slice(0,120)};}}));
 const opportunities=instruments.map(instrument=>{const chart=charts[instrument.id],scored=scoreGlobalOpportunity({change24hPct:instrument.change24hPct,volume24hUsd:instrument.volume24hUsd,liquidityUsd:instrument.liquidityUsd,chart:chart&&!chart.error?chart:undefined});return {instrument,chart:chart&&!chart.error?chart:null,...scored};}).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score).slice(0,250);
 const completedAt=Date.now(),summary={discoveredCount:instruments.length,scannedCount:deep.length,byAssetClass:Object.fromEntries([...new Set(instruments.map(x=>x.assetClass))].map(k=>[k,instruments.filter(x=>x.assetClass===k).length])),sourceCount:Object.keys(sourceHealth).length,onlineSources:Object.values(sourceHealth).filter((x:any)=>x.status==='online').length,chartTimeframe:'5m',chartCandles:100,higherTimeframe:'1h',higherTimeframeCoverage:mtfCandidates.length,deepScanCoverage:deep.length,limitations:['Coverage is broad but not literally every global instrument or on-chain pool; provider catalogs and public APIs are incomplete and rate-limited.','Binance Spot and USD-M perpetual and Bitget Spot and USDT perpetual are discovered from exchange-wide ticker catalogs.','DEX coverage uses latest token profiles and new pools across eight chains; this is not exhaustive chain indexing.','Forex reference rates are daily snapshots, not executable intraday quotes. Configure TWELVE_DATA_API_KEY for equity, index, commodity and intraday FX quotes.','Only the most liquid Binance spot and perpetual instruments receive detailed 5-minute candle pattern analysis per run; other instruments receive quote/volume screening.','No scan authorises orders. Live exchange execution remains disabled.']};
 try{await env.DB.prepare('DELETE FROM global_market_scan_runs WHERE started_at<?').bind(completedAt-30*86400000).run();}catch(error){sourceHealth['D1 run retention']={status:'unavailable',error:String(error).slice(0,180)};}
 let snapshotStored=false,snapshotError:string|null=null;
 sourceHealth['Market Universe KV']={status:'online',count:instruments.length};
 let history:any[]=[];try{const previousRaw=await env.KV_BINDING.get('global-market:universe:v1'),previous=previousRaw?JSON.parse(previousRaw):null;history=Array.isArray(previous?.history)?previous.history:previous?.completedAt?[{at:previous.completedAt,count:Number(previous.opportunities?.length||0)}]:[];}catch{}
 history=history.filter(x=>Number(x.at)>=completedAt-86400000&&Number.isFinite(Number(x.count))).slice(-200);
 history.push({at:completedAt,count:opportunities.length});
 const opportunities24h=history.reduce((sum,x)=>sum+Number(x.count||0),0);
 const snapshot={runId,startedAt,completedAt,status:'completed',summary,sourceHealth,instruments,opportunities,history,opportunities24h};
 try{await env.KV_BINDING.put('global-market:universe:v1',JSON.stringify(snapshot));snapshotStored=true;}
 catch(error){snapshotError=String(error).slice(0,240);sourceHealth['Market Universe KV']={status:'unavailable',error:snapshotError};}
 let runtimeAssignments:any={activated:0,assigned:0,reason:'Market snapshot unavailable'};if(snapshotStored){try{runtimeAssignments=await ensureDefaultRuntimeAgentAssignments(env,instruments,opportunities,completedAt);}catch(error){runtimeAssignments={activated:0,assigned:0,error:String(error).slice(0,180)};sourceHealth['Agent assignment manager']={status:'degraded',error:String(error).slice(0,180)};}}
 try{await env.DB.prepare('UPDATE global_market_scan_runs SET completed_at=?,status=?,discovered_count=?,scanned_count=?,source_health_json=?,summary_json=?,error=? WHERE run_id=?').bind(completedAt,snapshotStored?'completed':'degraded',instruments.length,deep.length,JSON.stringify(sourceHealth),JSON.stringify({...summary,snapshotStored}),snapshotError,runId).run();}catch(error){sourceHealth['D1 run history']={status:'unavailable',error:String(error).slice(0,180)};}
 try{await audit(env,'global.market.scan.completed','global-market-scanner',{runId,discovered:instruments.length,deepScanned:deep.length,opportunities:opportunities.length,snapshotStored,sourceHealth});}catch{}
 return {runId,startedAt,completedAt,status:snapshotStored?'completed':'degraded',snapshotStored,summary,sourceHealth,runtimeAssignments,opportunities:opportunities.slice(0,100).map(x=>({...x.instrument,chart:x.chart,score:x.score,direction:x.direction,reasons:x.reasons}))};
}


async function divisionAccount(env:Env,division:TradingDivision){return env.DB.prepare('SELECT * FROM division_paper_accounts WHERE division_id=?').bind(division).first<any>();}
async function closeDivisionPaperPosition(env:Env,position:any,book:OrderBookSnapshot,reason:string){
 const claimNow=Date.now(),staleClosingBefore=claimNow-60_000,claim=await env.DB.prepare("UPDATE division_paper_positions SET status='closing',closing_since=? WHERE position_id=? AND (status='open' OR (status='closing' AND (closing_since IS NULL OR closing_since<?)))").bind(claimNow,position.position_id,staleClosingBefore).run();
 if(Number(claim.meta?.changes??0)!==1)return {closed:false,reason:'position already claimed or closed'};
 const payload=JSON.parse(String(position.payload_json||'{}')),feeBps=Number.isFinite(payload.feeBps)?Number(payload.feeBps):10;
 const exit=planPaperLongExit({book,quantity:Number(position.quantity),entryPrice:Number(position.entry_price),entryFee:Number(position.entry_fee),feeBps,now:Date.now(),maxSlippageBps:25});
 if(!exit.valid||exit.averageExitPrice===null){await env.DB.prepare("UPDATE division_paper_positions SET status='open',closing_since=NULL WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,errors:exit.errors};}
 const account=await divisionAccount(env,position.division_id);
 if(!account){await env.DB.prepare("UPDATE division_paper_positions SET status='open',closing_since=NULL WHERE position_id=? AND status='closing'").bind(position.position_id).run();return {closed:false,reason:'division account unavailable'};}
 const now=Date.now(),equityAfter=Math.max(0,Number(account.equity)+exit.netPnl),peak=Math.max(Number(account.peak_equity),equityAfter),dayKey=new Date(now).toISOString().slice(0,10),dayStart=account.day_key===dayKey&&Number(account.day_start_equity)>0?Number(account.day_start_equity):Number(account.equity),dailyLoss=dayStart>0?Math.max(0,(dayStart-equityAfter)/dayStart*100):100;
 const riskCash=Math.max(0,Number(payload.riskCash||0)),rMultiple=riskCash>0?exit.netPnl/riskCash:null,fillId=uuid();
 try{
  await env.DB.batch([
  env.DB.prepare("UPDATE division_paper_positions SET status='closed',closing_since=NULL,closed_at=?,exit_price=?,exit_fee=?,gross_pnl=?,net_pnl=?,exit_reason=? WHERE position_id=? AND status='closing'").bind(now,exit.averageExitPrice,exit.exitFee,exit.grossPnl,exit.netPnl,reason,position.position_id),
  env.DB.prepare("INSERT INTO division_paper_fills(fill_id,position_id,division_id,symbol,side,quantity,price,fee,slippage_bps,created_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(fillId,position.position_id,position.division_id,position.symbol,'sell',exit.filledQuantity,exit.averageExitPrice,exit.exitFee,exit.slippageBps,now,JSON.stringify({reason,netPnl:exit.netPnl})),
  env.DB.prepare("UPDATE division_paper_accounts SET equity=?,peak_equity=?,daily_loss_pct=?,day_key=?,day_start_equity=?,open_positions=MAX(0,open_positions-1),reserved_notional=MAX(0,reserved_notional-?),reserved_risk_cash=MAX(0,reserved_risk_cash-?),updated_at=? WHERE division_id=?").bind(equityAfter,peak,dailyLoss,dayKey,dayStart,Number(position.quantity)*Number(position.entry_price)+Number(position.entry_fee),riskCash,now,position.division_id),
  env.DB.prepare("UPDATE division_performance SET closed_at=?,net_pnl_usd=?,r_multiple=?,outcome=? WHERE division_id=? AND trade_id=?").bind(now,exit.netPnl,rMultiple,exit.netPnl>0?'win':exit.netPnl<0?'loss':'breakeven',position.division_id,position.position_id),
  env.DB.prepare("INSERT INTO audit_events(id,event_type,actor,created_at,payload_json) VALUES(?,?,?,?,?)").bind(uuid(),'adaptive.paper.position.closed','division-paper-execution',now,JSON.stringify({positionId:position.position_id,division:position.division_id,symbol:position.symbol,reason,netPnl:exit.netPnl,rMultiple}))
   ]);
 }catch(error){await env.DB.prepare("UPDATE division_paper_positions SET status='open',closing_since=NULL WHERE position_id=? AND status='closing'").bind(position.position_id).run();throw error;}
 return {closed:true,positionId:position.position_id,division:position.division_id,netPnl:exit.netPnl,rMultiple,reason};
}
async function openDivisionPaperPosition(env:Env,division:TradingDivision,assessment:any,evidence:MarketEvidence,book:OrderBookSnapshot,policy:DivisionPolicy){
 const account=await divisionAccount(env,division);if(!account)return {opened:false,reason:'division paper account not initialized'};
 const today=new Date().toISOString().slice(0,10);
 if(account.day_key!==today){await env.DB.prepare('UPDATE division_paper_accounts SET day_key=?,day_start_equity=equity,daily_loss_pct=0,updated_at=? WHERE division_id=?').bind(today,Date.now(),division).run();account.day_key=today;account.day_start_equity=Number(account.equity);account.daily_loss_pct=0;}
 if(Number(account.daily_loss_pct)>=policy.maxDailyLossPct)return {opened:false,reason:'division daily loss limit reached'};
 if(Number(account.open_positions)>=policy.maxOpenPositions)return {opened:false,reason:'division open-position limit reached'};
 if(Number(account.equity)<=0)return {opened:false,reason:'division equity depleted'};
 const existing=await env.DB.prepare("SELECT position_id FROM division_paper_positions WHERE division_id=? AND symbol=? AND status IN ('open','closing') LIMIT 1").bind(division,evidence.symbol).first<any>();
 if(existing)return {opened:false,reason:'division already has an open position in this instrument'};
 const levels=buildLongPaperLevels(evidence,division);if(!levels.valid)return {opened:false,reason:levels.reason};
 const capitalLimitUsd=policy.maxRiskPerTradePct>0?Number(assessment.riskBudgetUsd)/(policy.maxRiskPerTradePct/100):0,effectiveEquity=Math.min(Number(account.equity),capitalLimitUsd);
 if(!(effectiveEquity>0))return {opened:false,reason:'division allocation has no deployable capital'};
 const dayStart=Number(account.day_start_equity||account.equity),availableEquity=Math.max(0,effectiveEquity-Number(account.reserved_notional||0));
 if(!(availableEquity>0))return {opened:false,reason:'division allocation is fully reserved by open paper positions'};
 if(dayStart<=0)return {opened:false,reason:'division daily risk baseline is unavailable'};
 const feeBps=10,riskPct=policy.maxRiskPerTradePct,plan=planPaperLongEntry({book,equity:availableEquity,stopPrice:levels.stop,targetPrice:levels.target,riskPct,feeBps,maxRiskPct:policy.maxRiskPerTradePct,now:Date.now(),maxSlippageBps:25});
 if(!plan.valid||plan.averageFillPrice===null)return {opened:false,reason:'division paper risk engine rejected the order',vetoes:plan.errors};
 const now=Date.now(),positionId=uuid(),fillId=uuid(),dayKey=new Date(now).toISOString().slice(0,10),reserveNotional=plan.notional+plan.entryFee;
 const reservation=await env.DB.prepare("UPDATE division_paper_accounts SET open_positions=open_positions+1,reserved_notional=reserved_notional+?,reserved_risk_cash=reserved_risk_cash+?,updated_at=? WHERE division_id=? AND open_positions<? AND equity>0 AND daily_loss_pct<? AND reserved_notional+?<=? AND reserved_notional+?<=equity AND daily_loss_pct+((reserved_risk_cash+?)/?)*100<=?").bind(reserveNotional,plan.riskCash,now,division,policy.maxOpenPositions,policy.maxDailyLossPct,reserveNotional,capitalLimitUsd,reserveNotional,plan.riskCash,dayStart,policy.maxDailyLossPct).run();
 if(Number(reservation.meta?.changes??0)!==1)return {opened:false,reason:'division capital, daily-risk or position reservation failed or a concurrent limit was reached'};
 const payload={feeBps,riskCash:plan.riskCash,referencePrice:plan.referencePrice,slippageBps:plan.slippageBps,netRewardRisk:plan.netRewardRisk,decisionScore:assessment.score,observedAt:evidence.observedAt,assetClass:evidence.assetClass,executionVenue:'Binance Spot paper simulation'};
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO division_paper_positions(position_id,division_id,symbol,side,quantity,entry_price,stop_price,target_price,entry_fee,risk_pct,strategy_id,status,opened_at,payload_json) VALUES(?,?,?,'long',?,?,?,?,?,?,?,'open',?,?)").bind(positionId,division,evidence.symbol,plan.quantity,plan.averageFillPrice,levels.stop,levels.target,plan.entryFee,plan.actualRiskPct,assessment.strategy,now,JSON.stringify(payload)),
   env.DB.prepare("INSERT INTO division_paper_fills(fill_id,position_id,division_id,symbol,side,quantity,price,fee,slippage_bps,created_at,payload_json) VALUES(?,?,?,?,'buy',?,?,?,?,?,?)").bind(fillId,positionId,division,evidence.symbol,plan.quantity,plan.averageFillPrice,plan.entryFee,plan.slippageBps,now,JSON.stringify({referencePrice:plan.referencePrice,notional:plan.notional})),
   env.DB.prepare("INSERT INTO division_performance(division_id,trade_id,strategy_id,symbol,opened_at,source) VALUES(?,?,?,?,?,'paper')").bind(division,positionId,assessment.strategy,evidence.symbol,now),
   env.DB.prepare("INSERT INTO audit_events(id,event_type,actor,created_at,payload_json) VALUES(?,?,?,?,?)").bind(uuid(),'adaptive.paper.position.opened','division-paper-execution',now,JSON.stringify({positionId,division,symbol:evidence.symbol,strategy:assessment.strategy,score:assessment.score,riskPct:plan.actualRiskPct,stop:levels.stop,target:levels.target}))
  ]);
 }catch(error){await env.DB.prepare("UPDATE division_paper_accounts SET open_positions=MAX(0,open_positions-1),reserved_notional=MAX(0,reserved_notional-?),reserved_risk_cash=MAX(0,reserved_risk_cash-?),updated_at=? WHERE division_id=?").bind(reserveNotional,plan.riskCash,Date.now(),division).run();throw error;}
 return {opened:true,position:{positionId,division,symbol:evidence.symbol,strategy:assessment.strategy,entryPrice:plan.averageFillPrice,stopPrice:levels.stop,targetPrice:levels.target,quantity:plan.quantity,riskPct:plan.actualRiskPct,netRewardRisk:plan.netRewardRisk}};
}

async function reconcileDivisionPaperAccounts(env:Env){
 const rows=await env.DB.prepare('SELECT division_id,initial_equity,equity,peak_equity,open_positions,reserved_notional,reserved_risk_cash FROM division_paper_accounts').all<any>(),repairs:any[]=[];
 for(const account of rows.results){
  const division=String(account.division_id);
  const aggregate=await env.DB.prepare("SELECT SUM(CASE WHEN status IN ('open','closing') THEN 1 ELSE 0 END) AS open_count,COALESCE(SUM(CASE WHEN status='closed' THEN net_pnl ELSE 0 END),0) AS realised_pnl,COALESCE(SUM(CASE WHEN status IN ('open','closing') THEN quantity*entry_price+entry_fee ELSE 0 END),0) AS reserved_notional,COALESCE(SUM(CASE WHEN status IN ('open','closing') THEN json_extract(payload_json,'$.riskCash') ELSE 0 END),0) AS reserved_risk_cash FROM division_paper_positions WHERE division_id=?").bind(division).first<any>();
  const expectedEquity=Math.max(0,Number(account.initial_equity)+Number(aggregate?.realised_pnl||0)),openCount=Number(aggregate?.open_count||0),reservedNotional=Number(aggregate?.reserved_notional||0),reservedRisk=Number(aggregate?.reserved_risk_cash||0),mismatch=Math.abs(expectedEquity-Number(account.equity))>0.000001||openCount!==Number(account.open_positions)||Math.abs(reservedNotional-Number(account.reserved_notional||0))>0.000001||Math.abs(reservedRisk-Number(account.reserved_risk_cash||0))>0.000001;
  await env.DB.prepare("INSERT OR IGNORE INTO division_performance(division_id,trade_id,strategy_id,symbol,opened_at,closed_at,net_pnl_usd,r_multiple,outcome,source) SELECT division_id,position_id,strategy_id,symbol,opened_at,closed_at,net_pnl,CASE WHEN json_extract(payload_json,'$.riskCash')>0 THEN net_pnl/json_extract(payload_json,'$.riskCash') ELSE NULL END,CASE WHEN net_pnl>0 THEN 'win' WHEN net_pnl<0 THEN 'loss' ELSE 'breakeven' END,'paper' FROM division_paper_positions WHERE division_id=?").bind(division).run();
  if(mismatch){const peak=Math.max(Number(account.peak_equity),expectedEquity);await env.DB.prepare('UPDATE division_paper_accounts SET equity=?,peak_equity=?,open_positions=?,reserved_notional=?,reserved_risk_cash=?,updated_at=? WHERE division_id=?').bind(expectedEquity,peak,openCount,reservedNotional,reservedRisk,Date.now(),division).run();repairs.push({division,equityBefore:Number(account.equity),equityAfter:expectedEquity,openBefore:Number(account.open_positions),openAfter:openCount,reservedNotional,reservedRisk});}
 }
 if(repairs.length)await audit(env,'adaptive.paper.reconciliation.repaired','division-paper-reconciler',{repairs});
 return {checked:rows.results.length,repaired:repairs.length,repairs};
}


async function monitorDivisionPositionsForSymbol(env:Env,symbol:string,book:OrderBookSnapshot){
 const open=await env.DB.prepare("SELECT * FROM division_paper_positions WHERE symbol=? AND (status='open' OR (status='closing' AND (closing_since IS NULL OR closing_since<?)))").bind(symbol,Date.now()-60_000).all<any>(),monitor:any[]=[];
 for(const position of open.results){
  const entry=Number(position.entry_price),riskDistance=entry-Number(position.stop_price),payload=JSON.parse(String(position.payload_json||'{}')),feeBps=Number.isFinite(payload.feeBps)?Number(payload.feeBps):10;
  if(riskDistance>0&&book.mid>=entry+riskDistance&&Number(position.stop_price)<entry){
   const breakEven=entry*(1+feeBps/10000),moved=await env.DB.prepare("UPDATE division_paper_positions SET stop_price=? WHERE position_id=? AND status='open' AND stop_price<?").bind(breakEven,position.position_id,breakEven).run();
   if(Number(moved.meta?.changes??0)===1){position.stop_price=breakEven;monitor.push({positionId:position.position_id,action:'break-even-stop-raised',stopPrice:breakEven});}
  }
  const reason=position.status==='closing'?'recovered-closing':book.mid<=Number(position.stop_price)?'stop-loss':book.mid>=Number(position.target_price)?'take-profit':null;
  if(reason)monitor.push(await closeDivisionPaperPosition(env,position,book,reason));
 }
 return monitor;
}
async function runDivisionPositionMonitor(env:Env){
 const rows=await env.DB.prepare("SELECT DISTINCT symbol FROM division_paper_positions WHERE status='open' OR (status='closing' AND (closing_since IS NULL OR closing_since<?)) ORDER BY symbol LIMIT 20").bind(Date.now()-60_000).all<any>(),results:any[]=[];
 for(const row of rows.results){const symbol=String(row.symbol);try{const bundle=await marketBundle(env,symbol);results.push({symbol,actions:await monitorDivisionPositionsForSymbol(env,symbol,bundle.book)});}catch(error){results.push({symbol,error:String(error).slice(0,200)});}}
 return {observedAt:Date.now(),symbols:rows.results.length,results,liveTradingEnabled:false};
}

async function runAdaptiveDivisionScan(env:Env){
 const now=Date.now(),reconciliation=await reconcileDivisionPaperAccounts(env),master=await getPaperAccount(env),divisionRows=await env.DB.prepare('SELECT * FROM trading_divisions ORDER BY division_id').all<any>();
 const policies:Partial<Record<TradingDivision,DivisionPolicy>>={},accounts:Record<string,any>={};
 for(const row of divisionRows.results){const id=String(row.division_id) as TradingDivision;if(id!=='scalping'&&id!=='day-trading')continue;const account=await divisionAccount(env,id),enabled=Number(row.enabled)===1&&Number(row.allocation_usd)>0,divisionCapital=enabled?Math.min(Number(row.allocation_usd),Number(account?.equity||0)):0;policies[id]={...DEFAULT_DIVISION_POLICIES[id],allocationUsd:divisionCapital,maxRiskPerTradePct:Number(row.max_risk_per_trade_pct),maxDailyLossPct:Number(row.max_daily_loss_pct),maxOpenPositions:Number(row.max_open_positions),minScore:divisionCapital>0?DEFAULT_DIVISION_POLICIES[id].minScore:101};accounts[id]=account;}
 const allocation=Object.values(policies).reduce((sum,p)=>sum+Number(p?.allocationUsd||0),0),totalCapital=Math.max(0,Math.min(Number(master?.equity||0),allocation));
 const universeRaw=await env.KV_BINDING.get('global-market:universe:v1').catch(()=>null);
 let candidateRows:any[]=[];
 if(universeRaw){try{const snapshot=JSON.parse(universeRaw);if(snapshot.status==='completed'&&Number(snapshot.completedAt)>=now-20*60*1000)candidateRows=(snapshot.opportunities||[]).filter((x:any)=>x.instrument?.assetClass==='crypto-spot'&&x.instrument?.venue==='Binance Spot'&&Number(x.instrument?.observedAt)>=now-20*60*1000&&Number(x.score)>=18).sort((a:any,b:any)=>Number(b.score)-Number(a.score)).slice(0,6).map((x:any)=>({instrument_id:x.instrument.id,symbol:x.instrument.symbol,price:x.instrument.price,score:x.score,observed_at:x.instrument.observedAt,venue:x.instrument.venue}));}catch{candidateRows=[];}}
 else{const legacy=await env.DB.prepare("SELECT instrument_id,symbol,price,score,observed_at,venue FROM global_market_opportunities WHERE asset_class='crypto-spot' AND venue='Binance Spot' AND observed_at>? AND score>=18 ORDER BY score DESC,observed_at DESC LIMIT 6").bind(now-20*60*1000).all<any>();candidateRows=legacy.results;}
 const candidates={results:candidateRows},symbols=[...new Set(candidateRows.map((x:any)=>String(x.symbol)))].filter(s=>/^[A-Z0-9]{5,20}$/.test(s)).slice(0,6);
 const results:any[]=[];
 for(const symbol of symbols){
  try{
   const candidate=candidates.results.find((x:any)=>x.symbol===symbol);
   const bundle=await marketBundle(env,symbol);
   const [oneRaw,fiveRaw,hourRaw]=await Promise.all(['1m','5m','1h'].map(interval=>getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=120')));
   const observedAt=bundle.book.timestamp,convert=(rows:Kline[])=>rows.map(k=>({openTime:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:Number(k[6])})).filter(x=>x.closeTime<observedAt);
   const evidence=buildDivisionMarketEvidence({symbol,assetClass:'crypto-spot',candles1m:convert(oneRaw),candles5m:convert(fiveRaw),candles1h:convert(hourRaw),book:bundle.book,observedAt,feeBps:10});
   const decision=evaluateAdaptiveTrading(evidence,{totalCapitalUsd:totalCapital,policies}),decisionId=uuid();
   await env.DB.prepare('INSERT INTO adaptive_trading_decisions(decision_id,symbol,observed_at,mode,selected_json,assessments_json,rationale_json,live_trading_enabled) VALUES(?,?,?,?,?,?,?,0)').bind(decisionId,symbol,evidence.observedAt,decision.mode,JSON.stringify(decision.selected),JSON.stringify({scalping:decision.scalping,dayTrading:decision.dayTrading}),JSON.stringify(decision.rationale)).run();
   const executions:any[]=[];
   if(env.AUTO_PAPER_ENABLED==='true'&&totalCapital>0){for(const selected of decision.selected){const policy=policies[selected.division];if(policy)executions.push(await openDivisionPaperPosition(env,selected.division,selected,evidence,bundle.book,policy));}}
   await audit(env,'adaptive-trading.autonomous-evaluation','adaptive-division-runtime',{decisionId,symbol,mode:decision.mode,selected:decision.selected.map(x=>x.division),standDown:decision.standDown,executions});
   results.push({symbol,globalScore:candidate.score,decisionId,mode:decision.mode,selected:decision.selected.map(x=>x.division),standDown:decision.standDown,executions});
  }catch(error){results.push({symbol,error:String(error).slice(0,240)});}
 }
 return {observedAt:now,candidates:candidates.results.length,analysed:symbols.length,results,reconciliation,divisions:Object.fromEntries(Object.entries(accounts).map(([id,a])=>[id,{equity:Number(a?.equity||0),openPositions:Number(a?.open_positions||0),dailyLossPct:Number(a?.daily_loss_pct||0)}])),paperEnabled:env.AUTO_PAPER_ENABLED==='true',liveTradingEnabled:false,objective:{aspirationalReturnPct:98,guaranteed:false,priority:'capital-preservation'}};
}

async function route(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if((path.startsWith('/api/amd/')||path.startsWith('/api/intelligence/'))&&!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
 if(path==='/api/institutional/strategy/run'&&!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
 if(path==='/api/intelligence/advanced'&&request.method==='POST'){
  const body=await request.json() as {symbol?:string};
  const symbol=String(body.symbol||'BTCUSDT').toUpperCase();
  if(!/^(BTC|ETH|SOL|BNB)USDT$/.test(symbol))return json({error:'Supported symbols: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT'},400);
  const bundle=await marketBundle(env,symbol);
  const derivatives=assessDerivatives(await loadDerivatives(symbol),bundle.lastPrice,bundle.observedAt);
  const assessment=assessAdvancedMarket({symbol,observedAt:bundle.observedAt,closes:bundle.closes,volumes:bundle.snapshot.volumes??[],book:bundle.book,trades:bundle.book.trades??[]});
  await audit(env,'intelligence.advanced.assessed','advanced-intelligence-engine',{symbol,observedAt:assessment.observedAt,regime:assessment.regime.label,consensus:assessment.debate.consensus,vetoes:assessment.adversarial.vetoes.length,derivativesStatus:derivatives.status});
  return json({assessment,derivatives,mode:'research-only',liveTradingEnabled:false});
 }
 if(path==='/api/intelligence/predictive'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase();
  if(!/^(BTC|ETH|SOL|BNB)USDT$/.test(symbol))return json({error:'Supported symbols: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT'},400);
  const bundle=await marketBundle(env,symbol),now=bundle.observedAt;
  const bitgetResponse=await fetch('https://api.bitget.com/api/v2/spot/market/orderbook?symbol='+encodeURIComponent(symbol)+'&type=step0&limit=20',{signal:AbortSignal.timeout(5000)}).catch(()=>null);
  let bitget:any=null;if(bitgetResponse?.ok){const data=await bitgetResponse.json().catch(()=>null) as any;bitget=data?.data??null;}
  const quotes:ExchangeQuote[]=[{exchange:'Binance Spot',symbol,observedAt:now,bid:bundle.book.bids[0].price,ask:bundle.book.asks[0].price,bidDepth:bundle.book.bids.reduce((a,l)=>a+l.quantity,0),askDepth:bundle.book.asks.reduce((a,l)=>a+l.quantity,0),bids:bundle.book.bids,asks:bundle.book.asks,source:'Binance public REST order book'}];
  if(bitget){const bids=(bitget.bids||[]).map((l:any)=>({price:Number(l[0]),quantity:Number(l[1])})),asks=(bitget.asks||[]).map((l:any)=>({price:Number(l[0]),quantity:Number(l[1])})),bid=Number(bids[0]?.price),ask=Number(asks[0]?.price),observedAt=Number(bitget.ts);if(Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>bid&&Number.isFinite(observedAt)&&bids.length&&asks.length)quotes.push({exchange:'Bitget Spot',symbol,observedAt,bid,ask,bidDepth:bids.reduce((a:number,l:any)=>a+l.quantity,0),askDepth:asks.reduce((a:number,l:any)=>a+l.quantity,0),bids,asks,source:'Bitget public Spot order book'});}
  const sync=synchroniseExchanges(quotes,now),liquidity=buildLiquidityMap(sync.quotes,bundle.lastPrice),derivativeHistory=await loadPredictiveDerivatives(symbol);
  const validDerivatives=derivativeHistory.points.filter(p=>Number.isFinite(p.openInterest)&&Number.isFinite(p.fundingRate));
  const firstOi=validDerivatives[0]?.openInterest,lastOi=validDerivatives.at(-1)?.openInterest;
  const oiChange=firstOi&&lastOi!==undefined?(lastOi/firstOi-1)*100:null;
  for(const p of validDerivatives){await env.DB.prepare('INSERT OR IGNORE INTO derivatives_history(symbol,observed_at,funding_rate,open_interest,source) VALUES(?,?,?,?,?)').bind(symbol,p.observedAt,p.fundingRate,p.openInterest,derivativeHistory.source).run();}
  const liquidationRows=await env.DB.prepare('SELECT observed_at,side,price,quantity,source FROM liquidation_events WHERE symbol=? AND observed_at>? ORDER BY observed_at DESC LIMIT 5000').bind(symbol,now-86_400_000).all<any>();const liquidations=analyseLiquidations(liquidationRows.results.map(r=>({observedAt:Number(r.observed_at),side:r.side as 'long'|'short',price:Number(r.price),quantity:Number(r.quantity),source:String(r.source)})),now),strategyCloses=bundle.closes.slice(0,-1),returns=strategyCloses.slice(1).map((p:number,i:number)=>(p/strategyCloses[i]-1));
  const debate=buildSpecialistDebate({trendPct:(bundle.lastPrice/bundle.closes[0]-1)*100,depthImbalance:quotes.length?((quotes[0].bidDepth-quotes[0].askDepth)/(quotes[0].bidDepth+quotes[0].askDepth||1)):0,tradeDelta:bundle.book.trades?.length?((bundle.book.trades.filter((t:any)=>t.aggressor==='buy').reduce((a:number,t:any)=>a+t.price*t.quantity,0)-bundle.book.trades.filter((t:any)=>t.aggressor==='sell').reduce((a:number,t:any)=>a+t.price*t.quantity,0))/(bundle.book.trades.reduce((a:number,t:any)=>a+t.price*t.quantity,0)||1)):0,fundingRate:validDerivatives.at(-1)?.fundingRate??null,openInterestChangePct:oiChange,liquidations,exchangeHealthy:sync.healthy,spreadBps:bundle.snapshot.spreadBps??0});
  let portfolioRisk:any=null;try{const riskSymbols=['BTCUSDT','ETHUSDT','SOLUSDT'];const histories=await Promise.all(riskSymbols.map(async asset=>{try{const rows=await getJson<Kline[]>(binance(env)+'/api/v3/klines?symbol='+asset+'&interval=1m&limit=120');const closes=rows.map(k=>Number(k[4])).filter((v:number)=>Number.isFinite(v)&&v>0);return [asset,closes.slice(1).map((v:number,i:number)=>v/closes[i]-1)] as const;}catch{return [asset,[]] as const;}}));const aligned=Object.fromEntries(histories.filter(([,series])=>series.length>=20));portfolioRisk=calculatePortfolioRisk(Object.keys(aligned).length?aligned:{[symbol]:returns},.95);}catch(error){portfolioRisk={available:false,reason:String(error)};}
  const genome={id:'baseline-'+symbol,fast:9,slow:21,entryThreshold:.2,stopAtr:1.5,targetR:2,maxSpreadBps:20};
  const stress=adversarialStrategyTest(genome,[{name:'baseline',spreadMultiplier:1,slippageBps:5,missRate:0,latencyMs:100},{name:'spread-expansion',spreadMultiplier:1.5,slippageBps:15,missRate:.05,latencyMs:500},{name:'liquidity-shock',spreadMultiplier:2,slippageBps:30,missRate:.2,latencyMs:1500}]);
  const seed=[genome,{...genome,id:'conservative',fast:8,slow:26,stopAtr:2,targetR:1.8,maxSpreadBps:12},{...genome,id:'momentum',fast:5,slow:34,entryThreshold:.35,targetR:2.5}];
  const evolution=evolveStrategies(seed,(g)=>scoreStrategyGenome(g,strategyCloses),3,12);
  const execution=simulateSmartExecution({side:'buy',quantity:Math.max(0.000001,Math.min(0.001,5/bundle.lastPrice)),levels:bundle.book.asks,referencePrice:bundle.lastPrice,feeBps:10,maxSlippageBps:20,latencyMs:150,queuePenaltyBps:1});
  const runId=uuid(),eventPayload={symbol,observedAt:now,exchangeSync:sync,liquidations,debate,portfolioRisk,stress,evolutionBest:evolution.best?.genome??null,execution};
  const event=makeDecisionEvent(1,now,'predictive-liquidity.assessment',eventPayload);
  await env.DB.prepare('INSERT INTO predictive_liquidity_runs(run_id,symbol,observed_at,status,payload_json) VALUES(?,?,?,?,?)').bind(runId,symbol,now,'research-only',JSON.stringify(eventPayload)).run();
  await env.DB.prepare('INSERT INTO decision_replay_events(run_id,sequence,observed_at,event_kind,payload_json,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?)').bind(runId,event.sequence,event.at,event.kind,JSON.stringify(event.payload),event.previousHash,event.hash).run();
  await audit(env,'predictive-liquidity.completed','predictive-liquidity-engine',{runId,symbol,exchanges:sync.exchanges,exchangeHealthy:sync.healthy,liquidationStatus:liquidations.status,consensus:debate.consensus});
  const paperAccount=await getPaperAccount(env);return json({runId,symbol,observedAt:now,exchangeSync:sync,liquidityMap:liquidity,derivatives:{status:validDerivatives.length?'available':'unavailable',source:derivativeHistory.source,history:validDerivatives,openInterestChangePct:oiChange,limitations:['Historical funding and open-interest observations are available only where the public provider returns them.','Historical liquidation feed is not configured by default; externally ingested events are operator-supplied and not independently certified.']},liquidations,debate,adversarial:stress,strategyEvolution:evolution,portfolioRisk,smartExecution:execution,decisionReplay:{eventCount:1,finalHash:event.hash,valid:verifyDecisionReplay([event]).valid},paperAccount:{configured:!!paperAccount,initialEquity:Number(paperAccount?.initial_equity??0),equity:Number(paperAccount?.equity??0),currency:'USD',mode:'paper',automaticPaperTradingEnabled:env.AUTO_PAPER_ENABLED==='true'},liveTradingEnabled:false});
 }
 if(path==='/api/intelligence/liquidations/ingest'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>null) as any;if(!body||!Array.isArray(body.events)||body.events.length<1||body.events.length>500)return json({error:'Provide 1 to 500 liquidation events'},400);
  const symbol=String(body.symbol||'').toUpperCase(),exchange=String(body.exchange||'').slice(0,40),source=String(body.source||'').slice(0,80);
  if(!/^(BTC|ETH|SOL|BNB)USDT$/.test(symbol)||!exchange||!source)return json({error:'Valid symbol, exchange and source are required'},400);
  const valid=body.events.filter((e:any)=>e&&Number.isFinite(Number(e.observedAt))&&Number(e.observedAt)>0&&Number(e.observedAt)<=Date.now()+2000&&['long','short'].includes(e.side)&&Number.isFinite(Number(e.price))&&Number(e.price)>0&&Number.isFinite(Number(e.quantity))&&Number(e.quantity)>0);
  if(valid.length!==body.events.length)return json({error:'One or more liquidation events are malformed or future-dated'},422);
  await env.DB.batch(valid.map((e:any)=>env.DB.prepare('INSERT OR IGNORE INTO liquidation_events(event_id,symbol,exchange_name,observed_at,side,price,quantity,source,ingested_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(String(e.id||uuid()).slice(0,100),symbol,exchange,Number(e.observedAt),e.side,Number(e.price),Number(e.quantity),'operator-ingested:'+source,Date.now())));
  await audit(env,'liquidations.ingested','operator-liquidation-feed',{symbol,exchange,source,submitted:valid.length});
  return json({accepted:valid.length,symbol,source:'operator-ingested:'+source,verifiedByPlatform:false,liveTradingEnabled:false});
 }
 if(path==='/api/intelligence/replay'&&request.method==='GET'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const runId=url.searchParams.get('runId')||'';if(!/^[a-f0-9-]{20,50}$/i.test(runId))return json({error:'Valid runId is required'},400);
  const rows=await env.DB.prepare('SELECT sequence,observed_at,event_kind,payload_json,previous_hash,event_hash FROM decision_replay_events WHERE run_id=? ORDER BY sequence').bind(runId).all<any>();
  const events=rows.results.map(r=>({sequence:Number(r.sequence),at:Number(r.observed_at),kind:String(r.event_kind),payload:JSON.parse(String(r.payload_json)),previousHash:String(r.previous_hash),hash:String(r.event_hash)}));
  return json({runId,...verifyDecisionReplay(events),events,liveTradingEnabled:false});
 }
 if(path==='/api/intelligence/recovery'&&request.method==='GET'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const rows=await env.DB.prepare('SELECT * FROM agent_recovery_leases ORDER BY updated_at DESC LIMIT 100').all<any>();
  const decisions=rows.results.map(r=>({agentId:r.agent_id,idempotencyKey:r.idempotency_key,...recoverAgentState({status:r.status,attempts:Number(r.attempts),leaseUntil:Number(r.lease_until),maxAttempts:Number(r.max_attempts)},Date.now()),lastError:r.last_error}));
  return json({leases:decisions,liveTradingEnabled:false});
 }
 if(path==='/api/operator/status'&&request.method==='GET'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const checks:{database:string;kv:string;orchestrator:string}={database:'unavailable',kv:'unavailable',orchestrator:'unavailable'};
  try{const row=await env.DB.prepare('SELECT 1 AS ok').first<any>();checks.database=row?.ok===1?'connected':'failed';}catch{checks.database='failed';}
  const probe='health:operator:'+uuid();
  try{await env.KV_BINDING.put(probe,'ok',{expirationTtl:60});const value=await env.KV_BINDING.get(probe);checks.kv=value==='ok'?'connected':'failed';await env.KV_BINDING.delete(probe);}catch{checks.kv='failed';}
  try{const id=env.ORCHESTRATOR.idFromName('global'),response=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');checks.orchestrator=response.ok?'connected':'failed';}catch{checks.orchestrator='failed';}
  const ok=Object.values(checks).every(x=>x==='connected');
  return json({ok,authenticated:true,operatorSecretConfigured:!!env.OPERATOR_API_TOKEN,service:'jpbots-6-backend',checks,liveTradingEnabled:false,checkedAt:Date.now()},ok?200:503);
 }
 if(path==='/health'){const checks:Record<string,string>={database:'unknown',kv:'unknown',orchestrator:'unknown'};try{const db=await env.DB.prepare('SELECT 1 AS ok').first<any>();checks.database=db?.ok===1?'connected':'failed';}catch{checks.database='degraded';}try{const probe='health:probe:'+uuid();await env.KV_BINDING.put(probe,'ok',{expirationTtl:30});checks.kv=(await env.KV_BINDING.get(probe))==='ok'?'connected':'failed';await env.KV_BINDING.delete(probe);}catch{checks.kv='degraded';}try{const id=env.ORCHESTRATOR.idFromName('global'),response=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');checks.orchestrator=response.ok?'connected':'degraded';}catch{checks.orchestrator='degraded';}return json({ok:true,worker:'online',service:'jpbots-6-backend',dependencies:checks,degraded:Object.values(checks).some(x=>x!=='connected'),liveTradingEnabled:false,now:Date.now()});}
 if(path==='/api/registry'&&request.method==='GET')return json({departments:departments.map(d=>({id:d.id,name:d.name,mandate:d.mandate,roles:d.agents.length,capabilities:d.capabilities,bots:d.bots??[]})),registeredRoleCount:allAgentRoles.length,roles:allAgentRoles.map(r=>({id:r.departmentId+':'+r.name,name:r.name,task:r.task,department:r.department})),platformServices,departmentRuntime:departments.map(d=>({departmentId:d.id,status:d.id==='market'?'scheduled-market-scanner':d.id==='risk'?'shared-final-capital-veto':d.id==='signals'?'shared-evidence-arbitration':d.id==='strategy'?'shared-regime-selector':d.id==='jb2'?'shared-analytics-primitives':d.id==='validation'?'on-demand-EMA-backtest':d.id==='institutional'?'persistent-institutional-role-runtime':'registered-no-independent-worker-handler',independentWorkersRunning:false})),rolesAreDefinitions:true,independentWorkersRunning:false});
 if(path==='/api/agents'&&request.method==='GET'){
  const [states,assignments]=await Promise.all([env.DB.prepare('SELECT role_id,enabled,status,heartbeat_at,last_error,updated_at FROM agent_state').all<any>(),env.DB.prepare('SELECT role_id,division_id,symbol,timeframe,status,assignment_source,assigned_at,updated_at FROM agent_assignments').all<any>()]),byId=new Map(states.results.map(x=>[x.role_id,x])),byAssignment=new Map(assignments.results.map(x=>[x.role_id,x]));
  return json({registered:allAgentRoles.length,agents:allAgentRoles.map((r,i)=>{const id=r.departmentId+':'+r.name,state=byId.get(id),assignment=byAssignment.get(id),enabled=state?.enabled===1,divisionId=r.departmentId==='scalp'?'scalping':r.departmentId==='day'?'day-trading':'shared';return {id,sequence:i+1,name:r.name,department:r.department,departmentId:r.departmentId,divisionId,task:r.task,enabled,status:!enabled?'PAUSED':assignment?.status??state?.status??'AWAITING_ASSIGNMENT',symbol:assignment?.symbol??null,timeframe:assignment?.timeframe??(r.departmentId==='scalp'?'1m/3m/5m':r.departmentId==='day'?'5m/15m/30m/1h/4h':'MULTI-TIMEFRAME'),assignmentSource:assignment?.assignment_source??null,assignedAt:assignment?.assigned_at??null,heartbeatAt:state?.heartbeat_at??null,lastError:state?.last_error??null,workerProcessRunning:false,executionScope:r.departmentId==='scalp'?'SCALPING_DIVISION_POLICY':r.departmentId==='day'?'DAY_TRADING_DIVISION_POLICY':r.departmentId==='institutional'?'INSTITUTIONAL_EVIDENCE_HANDLER':'SHARED_INTELLIGENCE'};})});
 }
 if(path==='/api/agents/control'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,roleId=String(body.roleId||''),enabled=body.enabled===true;
  const role=allAgentRoles.find(r=>r.departmentId+':'+r.name===roleId);
  if(!role||typeof body.enabled!=='boolean')return json({error:'A valid roleId and boolean enabled value are required'},400);
  const now=Date.now(),divisionId=role.departmentId==='scalp'?'scalping':role.departmentId==='day'?'day-trading':'shared',supported=role.departmentId==='institutional'||(role.departmentId==='scalp'&&role.name==='Scalping Market Scanner')||(role.departmentId==='day'&&role.name==='Intraday Market Scanner');
  let symbol:string|null=null,assignmentStatus=enabled?(supported?'AWAITING_MARKET_DATA':'AWAITING_CAPABILITY'):'PAUSED',source:string|null=null;
  if(enabled&&supported){
   const raw=await env.KV_BINDING.get('global-market:universe:v1').catch(()=>null);
   try{const snapshot=raw?JSON.parse(raw):null,rows=Array.isArray(snapshot?.opportunities)?snapshot.opportunities:[],eligible=rows.filter((x:any)=>x.instrument?.assetClass==='crypto-spot'&&x.instrument?.venue==='Binance Spot'&&Number(x.instrument?.observedAt)>=now-20*60*1000&&Number(x.score)>=18).sort((a:any,b:any)=>Number(b.score)-Number(a.score));
    const fallback=(snapshot?.instruments||[]).filter((x:any)=>x.assetClass==='crypto-spot'&&x.venue==='Binance Spot'&&x.tradable!==false&&Number(x.observedAt)>=now-20*60*1000).sort((a:any,b:any)=>Number(b.volume24hUsd||0)-Number(a.volume24hUsd||0))[0];const picked=eligible[0]?.instrument??fallback;if(picked&&/^[A-Z0-9]{5,20}$/.test(String(picked.symbol||''))){symbol=String(picked.symbol);source='global-market-universe';assignmentStatus='ASSIGNED';}
   }catch{}
  }
  const timeframe=role.departmentId==='scalp'?'1m/3m/5m':role.departmentId==='day'?'5m/15m/30m/1h/4h':'MULTI-TIMEFRAME';
  await env.DB.batch([
   env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,?,?,NULL,?,?) ON CONFLICT(role_id) DO UPDATE SET enabled=excluded.enabled,status=excluded.status,last_error=excluded.last_error,updated_at=excluded.updated_at").bind(roleId,enabled?1:0,assignmentStatus,enabled&&assignmentStatus==='AWAITING_MARKET_DATA'?'Waiting for a fresh eligible Binance Spot market opportunity':enabled&&assignmentStatus==='AWAITING_CAPABILITY'?'This specialist role has no independent scheduled execution handler yet':null,now),
   env.DB.prepare("INSERT INTO agent_assignments(role_id,division_id,symbol,timeframe,status,assignment_source,assigned_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(role_id) DO UPDATE SET division_id=excluded.division_id,symbol=excluded.symbol,timeframe=excluded.timeframe,status=excluded.status,assignment_source=excluded.assignment_source,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at").bind(roleId,divisionId,symbol,timeframe,assignmentStatus,source,enabled?now:null,now),
   env.DB.prepare("INSERT INTO audit_events(id,event_type,actor,created_at,payload_json) VALUES(?,?,?,?,?)").bind(uuid(),enabled?'agent.activated':'agent.deactivated','operator',now,JSON.stringify({roleId,divisionId,symbol,status:assignmentStatus}))
  ]);
  if(role.departmentId==='scalp'&&role.name==='Scalping Market Scanner')await env.DB.prepare('UPDATE trading_divisions SET enabled=?,updated_at=? WHERE division_id=?').bind(enabled&&assignmentStatus==='ASSIGNED'?1:0,now,'scalping').run();
  if(role.departmentId==='day'&&role.name==='Intraday Market Scanner')await env.DB.prepare('UPDATE trading_divisions SET enabled=?,updated_at=? WHERE division_id=?').bind(enabled&&assignmentStatus==='ASSIGNED'?1:0,now,'day-trading').run();
  return json({ok:true,roleId,enabled,divisionId,symbol,timeframe,status:assignmentStatus,tradeExecution:'paper-only; subject to adaptive and capital risk approval',liveTradingEnabled:false});
 }
 if(path==='/api/agent-tasks'&&request.method==='GET'){const requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.min(500,Math.max(1,requested)):100;const rows=await env.DB.prepare('SELECT id,role_id,task_type,status,created_at,updated_at,payload_json,result_json FROM agent_tasks ORDER BY created_at DESC LIMIT ?').bind(limit).all();return json({tasks:rows.results});}
 if(path==='/api/decisions'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,symbol,observed_at,market_regime,direction,decision,blockers_json,report_json FROM scan_decisions ORDER BY observed_at DESC LIMIT 100').all();return json({decisions:rows.results});}
 if(path==='/api/providers'&&request.method==='GET')return json({marketData:{binanceSpot:{status:'connected-on-request',public:true},bitgetPublic:{status:'connected-on-request',public:true,markets:['spot','margin-reference','usdt-m','coin-m','usdc-m']},solanaDex:{provider:'DexScreener',status:'connected-on-request',public:true},solanaNewPools:{provider:'GeckoTerminal',status:'connected-on-request',public:true}},macroNews:{status:'not-configured',reason:'No licensed provider credentials configured'},traderDiscovery:{status:'not-configured',reason:'No supported source-trader data provider configured'},execution:{bitget:{status:'not-connected',markets:['spot','margin','usdt-m','coin-m','usdc-m']},solanaDex:{status:'read-only'}},liveTradingEnabled:false});
 if(path==='/api/market/tickers'&&request.method==='GET'){
  const symbols=(url.searchParams.get('symbols')||'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z0-9]{5,20}$/.test(x)).slice(0,20);
  if(!symbols.length)return json({ok:false,error:'No valid ticker symbols supplied',code:'NO_VALID_SYMBOLS'},400);
  const result=await fetchMarketTickers(symbols,binance(env));
  return json(result);
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


 if(path==='/api/ai/status'&&request.method==='GET'){const keys=configuredLlmKeys(env.LLM_API_KEYS);return json({provider:keys.length?'OpenAI-compatible multi-key failover + Workers AI fallback':'Cloudflare Workers AI',bindingAvailable:!!env.AI||keys.length>0,enabled:env.AI_ENABLED==='true',configuredKeySlots:keys.length,workersAiFallbackAvailable:!!env.AI,model:env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it',automaticAnalysis:false,liveTradingEnabled:false,reason:env.AI_ENABLED==='true'?'LLM enabled for authenticated specialist analysis; external key slots fail over sequentially, then Workers AI':'LLM inference is disabled'});}
 if(path==='/api/agents/analyse'&&request.method==='POST'){
  if(!env.OPERATOR_API_TOKEN||request.headers.get('authorization')!=='Bearer '+env.OPERATOR_API_TOKEN)return json({error:'Operator authentication required'},401);
  const llm=llmBinding(env);if(env.AI_ENABLED!=='true'||!llm)return json({error:'AI specialist analysis is not enabled or no provider is configured',bindingAvailable:!!llm,enablement:'Set AI_ENABLED=true and configure LLM_API_KEYS or the Workers AI binding',liveTradingEnabled:false},503);
  const body=await request.json().catch(()=>({})) as any,departmentId=String(body.departmentId||'market'),symbol=String(body.symbol||'BTCUSDT').toUpperCase(),department=departments.find(x=>x.id===departmentId);
  if(!department)return json({error:'Unknown departmentId'},404);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))return json({error:'Invalid market symbol'},400);
  const bundle=await marketBundle(env,symbol),report=buildMarketReport(bundle.snapshot),depth=analyseOrderBook(bundle.book),model=env.AI_MODEL||'@cf/google/gemma-4-26b-a4b-it';
  const result=await runDepartmentCouncil(llm,model,department,{symbol,observedAt:bundle.observedAt,price:bundle.lastPrice,marketReport:report,orderBook:depth});
  const now=Date.now(),taskRows=result.findings.map(f=>env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),department.id+':'+f.roleName,'ai-department-analysis','completed',now,now,JSON.stringify({departmentId,symbol,model,promptVersion:result.promptVersion}),JSON.stringify(f)));
  for(const roleName of result.missingRoles)taskRows.push(env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),department.id+':'+roleName,'ai-department-analysis','incomplete',now,now,JSON.stringify({departmentId,symbol,model,promptVersion:result.promptVersion}),JSON.stringify({reason:'No validated finding returned by the model'})));
  const findingsByRole=new Map(result.findings.map(f=>[f.roleName,f]));
  const stateRows=department.agents.map(role=>{const finding=findingsByRole.get(role.name),status=finding?'ANALYSED':'INCOMPLETE',lastError=finding?null:'No validated specialist finding returned by the model';return env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,0,?,?,?,?) ON CONFLICT(role_id) DO UPDATE SET status=excluded.status,heartbeat_at=excluded.heartbeat_at,last_error=excluded.last_error,updated_at=excluded.updated_at").bind(department.id+':'+role.name,status,now,lastError,now);});
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
 if(path==='/api/amd/replay'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase(),days=Number(body.days??30);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!Number.isFinite(days)||days<1||days>60)return json({error:'Valid symbol and 1–60 day history window are required'},400);
  const candles=await fetchAmdHistory(env,symbol,days),config={...({} as AmdValidationConfig),...(body.config||{}),timezone:String(body.timezone||body.config?.timezone||env.AMD_SESSION_TIMEZONE||'UTC')},result=replayAmdSessions(candles,config);
  if(!result.valid)return json({error:'AMD replay validation failed',reasons:result.errors},422);
  const costSensitivity=amdCostSensitivity(candles,result.config),runId=await saveAmdValidation(env,symbol,'replay',result.config,{...result,costSensitivity},result.metrics);
  return json({runId,symbol,source:'Binance Spot 5m historical klines',historyDays:days,...result,costSensitivity,liveExecutionEnabled:false});
 }
 if(path==='/api/amd/optimise'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase(),days=Number(body.days??30);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!Number.isFinite(days)||days<10||days>60)return json({error:'Valid symbol and 10–60 day history window are required for optimisation'},400);
  const candles=await fetchAmdHistory(env,symbol,days),result=optimiseAmdParameters(candles,{timezones:Array.isArray(body.timezones)?body.timezones.slice(0,6):[env.AMD_SESSION_TIMEZONE||'UTC','Africa/Accra','Europe/London'],sweepSensitivitiesBps:Array.isArray(body.sweepSensitivitiesBps)?body.sweepSensitivitiesBps.slice(0,6):[0,5,10],arrayStrengths:Array.isArray(body.arrayStrengths)?body.arrayStrengths.slice(0,6):[65,75,85]});
  const runId=await saveAmdValidation(env,symbol,'optimisation',body,result,result.best);
  return json({runId,symbol,source:'Binance Spot 5m historical klines',historyDays:days,...result,liveExecutionEnabled:false});
 }
 if(path==='/api/amd/walk-forward'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase(),days=Number(body.days??30),folds=Number(body.folds??3);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!Number.isFinite(days)||days<15||days>60||!Number.isInteger(folds)||folds<2||folds>5)return json({error:'Walk-forward requires a valid symbol, 15–60 days and 2–5 folds'},400);
  const candles=await fetchAmdHistory(env,symbol,days),result=walkForwardAmd(candles,folds);
  const runId=await saveAmdValidation(env,symbol,'walk-forward',{days,folds},result,result.aggregate);
  return json({runId,symbol,source:'Binance Spot 5m historical klines',historyDays:days,...result,liveExecutionEnabled:false});
 }
 if(path==='/api/amd/forward/run'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))return json({error:'Invalid symbol'},400);
  return json(await runAmdForwardScan(env,symbol));
 }
 if(path==='/api/amd/forward'&&request.method==='GET'){
  const symbol=url.searchParams.get('symbol'),status=url.searchParams.get('status'),requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.min(500,Math.max(1,requested)):100;
  const rows=await env.DB.prepare('SELECT opportunity_id,symbol,session_date,observed_at,phase,status,direction,reason_json,assessment_json,arbitration_json,paper_order_attempted,created_at FROM amd_forward_opportunities WHERE (? IS NULL OR symbol=?) AND (? IS NULL OR status=?) ORDER BY observed_at DESC LIMIT ?').bind(symbol,symbol,status,status,limit).all<any>();
  return json({opportunities:rows.results.map(r=>({...r,reason:JSON.parse(r.reason_json),assessment:JSON.parse(r.assessment_json),arbitration:r.arbitration_json?JSON.parse(r.arbitration_json):null})),liveExecutionEnabled:false});
 }
 if(path==='/api/amd/validation/runs'&&request.method==='GET'){
  const symbol=url.searchParams.get('symbol'),rows=await env.DB.prepare('SELECT run_id,symbol,run_type,strategy_version,started_at,completed_at,config_json,metrics_json FROM amd_validation_runs WHERE (? IS NULL OR symbol=?) ORDER BY completed_at DESC LIMIT 50').bind(symbol,symbol).all<any>();
  return json({runs:rows.results.map(r=>({...r,config:JSON.parse(r.config_json),metrics:JSON.parse(r.metrics_json)})),liveExecutionEnabled:false});
 }
 if(path==='/api/institutional/strategy/run'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as any,symbol=String(body.symbol||'BTCUSDT').toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))return json({error:'Invalid symbol'},400);
  return json(await runInstitutionalStrategyWorkflow(env,symbol,body.autoPaper===true));
 }
 if(path==='/api/institutional/strategy/latest'&&request.method==='GET'){
  const symbol=String(url.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const row=await env.DB.prepare('SELECT result_json FROM institutional_strategy_runs WHERE symbol=? ORDER BY created_at DESC LIMIT 1').bind(symbol).first<any>();
  return row?json(JSON.parse(row.result_json)):json({error:'No institutional strategy run found for symbol',symbol},404);
 }
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
 if(path==='/api/adaptive-trading/run'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  if(env.AUTO_PAPER_ENABLED!=='true')return json({error:'Automatic paper execution is disabled by the server safety switch',liveTradingEnabled:false},409);
  return json(await runAdaptiveDivisionScan(env));
 }
 if(path==='/api/adaptive-trading/status'&&request.method==='GET'){
  const divisions=await env.DB.prepare('SELECT * FROM trading_divisions ORDER BY division_id').all<any>();
  const decisions=await env.DB.prepare('SELECT decision_id,symbol,observed_at,mode,selected_json,assessments_json,rationale_json FROM adaptive_trading_decisions ORDER BY observed_at DESC LIMIT 30').all<any>();
  const performance=await env.DB.prepare("SELECT division_id,COUNT(*) AS trades,SUM(CASE WHEN net_pnl_usd>0 THEN 1 ELSE 0 END) AS wins,SUM(CASE WHEN net_pnl_usd<0 THEN 1 ELSE 0 END) AS losses,COALESCE(SUM(net_pnl_usd),0) AS netPnl,AVG(r_multiple) AS avgR,MAX(closed_at) AS lastClosedAt FROM division_performance WHERE source='paper' AND closed_at IS NOT NULL GROUP BY division_id").all<any>();
  const accounts=await env.DB.prepare('SELECT * FROM division_paper_accounts ORDER BY division_id').all<any>();
  const positions=await env.DB.prepare("SELECT position_id,division_id,symbol,side,quantity,entry_price,stop_price,target_price,strategy_id,status,opened_at FROM division_paper_positions WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 50").all<any>();
  return json({ok:true,divisions:divisions.results,accounts:accounts.results,openPositions:positions.results,performance:performance.results,decisions:decisions.results.map((r:any)=>({...r,selected:JSON.parse(r.selected_json),assessments:JSON.parse(r.assessments_json),rationale:JSON.parse(r.rationale_json)})),kpi:{aspirationalReturnPct:98,guaranteed:false,priority:'capital-preservation'},automaticPaperEnabled:env.AUTO_PAPER_ENABLED==='true',liveTradingEnabled:false});
 }
 if(path==='/api/adaptive-trading/evaluate'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>null) as {evidence?:MarketEvidence;totalCapitalUsd?:number}|null;
  if(!body?.evidence)return json({error:'Validated market evidence is required',liveTradingEnabled:false},400);
  const account=await getPaperAccount(env),capital=Number.isFinite(body.totalCapitalUsd)?Math.max(0,Math.min(Number(body.totalCapitalUsd),Number(account?.equity??0))):Number(account?.equity??0);
  const decision=evaluateAdaptiveTrading(body.evidence,{totalCapitalUsd:capital}),decisionId=uuid();
  await env.DB.prepare('INSERT INTO adaptive_trading_decisions(decision_id,symbol,observed_at,mode,selected_json,assessments_json,rationale_json,live_trading_enabled) VALUES(?,?,?,?,?,?,?,0)').bind(decisionId,decision.symbol,decision.observedAt,decision.mode,JSON.stringify(decision.selected),JSON.stringify({scalping:decision.scalping,dayTrading:decision.dayTrading}),JSON.stringify(decision.rationale)).run();
  await audit(env,'adaptive-trading.decision','adaptive-trading-arbitrator',{decisionId,symbol:decision.symbol,mode:decision.mode,selected:decision.selected.map(x=>x.division),standDown:decision.standDown});
  return json({decisionId,...decision,execution:'recommendation-only; no order submitted',liveTradingEnabled:false});
 }
 if(path==='/api/global-market/scan'&&request.method==='POST'){
  if(!operatorAuthorized(request,env))return json({error:'Operator authentication required'},401);
  const body=await request.json().catch(()=>({})) as {deepScanLimit?:number},limit=Number.isFinite(Number(body.deepScanLimit))?Math.min(12,Math.max(4,Number(body.deepScanLimit))):12;
  return json(await runGlobalMarketScan(env,limit));
 }
 if(path==='/api/global-market/status'&&request.method==='GET'){
  const snapshotRaw=await env.KV_BINDING.get('global-market:universe:v1').catch(()=>null);
  let snapshot:any=null;try{snapshot=snapshotRaw?JSON.parse(snapshotRaw):null;}catch{}
  let latest:any=null;if(!snapshot){try{latest=await env.DB.prepare('SELECT * FROM global_market_scan_runs ORDER BY started_at DESC LIMIT 1').first<any>();}catch{}}
  const counts=snapshot?.summary?.byAssetClass?Object.entries(snapshot.summary.byAssetClass).map(([asset_class,count])=>({asset_class,count})):null;
  let legacyCounts:any=null;if(!counts){try{legacyCounts=await env.DB.prepare('SELECT asset_class,COUNT(*) AS count FROM global_market_instruments GROUP BY asset_class').all<any>();}catch{legacyCounts={results:[]};}}
  const latestStatus=latest?.status==='running'&&Date.now()-Number(latest.started_at)>300000?'stale':latest?.status;
  return json({ok:true,latest:latest?{runId:latest.run_id,startedAt:latest.started_at,completedAt:latest.completed_at,status:latestStatus,discoveredCount:latest.discovered_count,scannedCount:latest.scanned_count,sourceHealth:JSON.parse(latest.source_health_json||'{}'),summary:JSON.parse(latest.summary_json||'{}'),error:latest.error}:snapshot?{runId:snapshot.runId,startedAt:snapshot.startedAt,completedAt:snapshot.completedAt,status:snapshot.status,discoveredCount:snapshot.summary?.discoveredCount,scannedCount:snapshot.summary?.scannedCount,sourceHealth:snapshot.sourceHealth,summary:snapshot.summary}:null,universe:Object.fromEntries((counts??legacyCounts!.results).map((x:any)=>[x.asset_class,Number(x.count)])),opportunities24h:snapshot?Number(snapshot.opportunities24h||snapshot.opportunities?.length||0):0,universeUpdatedAt:snapshot?.completedAt??null,liveTradingEnabled:false});
 }
 if(path==='/api/global-market/universe'&&request.method==='GET'){
  const assetClass=url.searchParams.get('assetClass'),requestedLimit=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requestedLimit)?Math.min(500,Math.max(1,requestedLimit)):100,requestedOffset=Number(url.searchParams.get('offset')||0),offset=Number.isFinite(requestedOffset)?Math.max(0,Math.floor(requestedOffset)):0,snapshotRaw=await env.KV_BINDING.get('global-market:universe:v1').catch(()=>null);
  let snapshot:any=null;try{snapshot=snapshotRaw?JSON.parse(snapshotRaw):null;}catch{}
  if(snapshot&&Array.isArray(snapshot.instruments)){const all=snapshot.instruments.filter((x:any)=>!assetClass||x.assetClass===assetClass).sort((a:any,b:any)=>Number(b.volume24hUsd??b.liquidityUsd??b.tvlUsd??0)-Number(a.volume24hUsd??a.liquidityUsd??a.tvlUsd??0)),page=all.slice(offset,offset+limit);return json({count:page.length,totalCount:all.length,offset,limit,runId:snapshot.runId,observedAt:snapshot.completedAt,instruments:page.map((x:any)=>({instrument_id:x.id,symbol:x.symbol,name:x.name,asset_class:x.assetClass,venue:x.venue,chain:x.chain,quote_asset:x.quote,price:x.price,change_24h_pct:x.change24hPct,volume_24h_usd:x.volume24hUsd,liquidity_usd:x.liquidityUsd,tvl_usd:x.tvlUsd,observed_at:x.observedAt,source:x.source,tradable:x.tradable,metadata:x.metadata||{}}))});}
  const rows=assetClass?await env.DB.prepare('SELECT * FROM global_market_instruments WHERE asset_class=? ORDER BY COALESCE(volume_24h_usd,liquidity_usd,tvl_usd,0) DESC LIMIT ? OFFSET ?').bind(assetClass,limit,offset).all<any>():await env.DB.prepare('SELECT * FROM global_market_instruments ORDER BY COALESCE(volume_24h_usd,liquidity_usd,tvl_usd,0) DESC LIMIT ? OFFSET ?').bind(limit,offset).all<any>(),total=assetClass?await env.DB.prepare('SELECT COUNT(*) AS count FROM global_market_instruments WHERE asset_class=?').bind(assetClass).first<any>():await env.DB.prepare('SELECT COUNT(*) AS count FROM global_market_instruments').first<any>();
  return json({count:rows.results.length,totalCount:Number(total?.count||0),offset,limit,instruments:rows.results.map((x:any)=>({...x,metadata:JSON.parse(x.metadata_json||'{}')}))});
 }
 if(path==='/api/global-market/opportunities'&&request.method==='GET'){
  const requestedLimit=Number(url.searchParams.get('limit')||50),limit=Number.isFinite(requestedLimit)?Math.min(200,Math.max(1,requestedLimit)):50,snapshotRaw=await env.KV_BINDING.get('global-market:universe:v1').catch(()=>null);
  let snapshot:any=null;try{snapshot=snapshotRaw?JSON.parse(snapshotRaw):null;}catch{}
  if(snapshot&&Array.isArray(snapshot.opportunities))return json({runId:snapshot.runId,observedAt:snapshot.completedAt,opportunities:snapshot.opportunities.slice(0,limit).map((x:any)=>({id:x.instrument.id,runId:snapshot.runId,instrumentId:x.instrument.id,symbol:x.instrument.symbol,assetClass:x.instrument.assetClass,venue:x.instrument.venue,observedAt:x.instrument.observedAt,price:x.instrument.price,change24hPct:x.instrument.change24hPct,score:x.score,direction:x.direction,source:x.instrument.source,chart:x.chart,reasons:x.reasons}))});
  const rows=await env.DB.prepare('SELECT * FROM global_market_opportunities ORDER BY observed_at DESC,score DESC LIMIT ?').bind(limit).all<any>();
  return json({opportunities:rows.results.map((x:any)=>({id:x.opportunity_id,runId:x.run_id,instrumentId:x.instrument_id,symbol:x.symbol,assetClass:x.asset_class,venue:x.venue,observedAt:x.observed_at,price:x.price,change24hPct:x.change_24h_pct,score:x.score,direction:x.direction,source:x.source,chart:JSON.parse(x.chart_json||'null'),reasons:JSON.parse(x.reasons_json||'[]')}))});
 }
 if(path==='/api/scan'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as {symbols?:unknown};const requested=Array.isArray(body.symbols)?body.symbols:['BTCUSDT','ETHUSDT','SOLUSDT'];const symbols=requested.filter((s):s is string=>typeof s==='string'&&/^[A-Z0-9]{5,20}$/.test(s)).slice(0,5);
  if(!symbols.length)return json({error:'No valid symbols supplied'},400);
  const scans=await Promise.allSettled(symbols.map(s=>runMarketScan(env,s)));
  return json({mode:'observation-only',liveTradingEnabled:false,scans:scans.map((s,i)=>s.status==='fulfilled'?s.value:{symbol:symbols[i],error:String(s.reason)})});
 }
 if(path==='/api/orchestrator/status'&&request.method==='GET'){const id=env.ORCHESTRATOR.idFromName('global');return env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');}
 if(path==='/api/scanner/status'&&request.method==='GET'){
  const id=env.ORCHESTRATOR.idFromName('global'),response=await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/status');
  if(!response.ok)return json({ok:false,state:'OFFLINE',error:'Durable Object status returned HTTP '+response.status},502);
  const scheduler=await response.json() as any;
  const taskRows=await env.DB.prepare("SELECT status,COUNT(*) AS count FROM agent_tasks WHERE updated_at>=? GROUP BY status").bind(Date.now()-24*60*60*1000).all<any>();
  const taskCounts=Object.fromEntries(taskRows.results.map((row:any)=>[String(row.status),Number(row.count)]));
  const ageMs=scheduler.lastProcessedAt===null?null:Math.max(0,Date.now()-Number(scheduler.lastProcessedAt));
  const state=!scheduler.schedulerStarted?'BOOTSTRAPPING':ageMs===null?'WAITING FOR FIRST TASK':ageMs<180000?'ACTIVE':scheduler.queued>0?'DRAINING BACKLOG':'IDLE';
  return json({ok:true,state,backend:'connected',scheduler:{...scheduler,lastProcessedAgeMs:ageMs,taskCounts,taskCapacity:500,tasksPerAlarm:SCANNER_TASKS_PER_ALARM},liveTradingEnabled:false,checkedAt:Date.now()});
 }
 if(path==='/api/audit'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,event_type,actor,created_at,payload_json FROM audit_events ORDER BY created_at DESC LIMIT 100').all();return json({events:rows.results});}
 return json({error:'Not found',path},404);
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{try{const id=env.ORCHESTRATOR.idFromName('global');await env.ORCHESTRATOR.get(id).fetch('https://orchestrator/ensure-schedule');return cors(await route(request,env));}catch(error){return cors(json({error:error instanceof Error?error.message:'Unexpected backend failure',liveTradingEnabled:false},502));}}
};
export class AgentOrchestrator {
 constructor(private state:DurableState,private env:Env){}
 async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/ensure-schedule'){const started=await this.state.storage.get<boolean>('schedulerStarted')??false;if(!started){await this.state.storage.put('schedulerStarted',true);await this.state.storage.setAlarm(Date.now()+1000);}return json({scheduler:'durable-object-alarm',started:true,cronRequired:false});}
  if(url.pathname==='/status'){const queue=await this.state.storage.get<Task[]>('queue')??[],lastProcessedAt=await this.state.storage.get<number>('lastProcessedAt')??null,lastError=await this.state.storage.get<string>('lastError')??null,processedCount=await this.state.storage.get<number>('processedCount')??0,schedulerStarted=await this.state.storage.get<boolean>('schedulerStarted')??false,lastScheduledMinute=await this.state.storage.get<string>('lastScheduledMinute')??null;return json({id:this.state.id.toString(),queued:queue.length,lastProcessedAt,lastError,processedCount,scheduler:'durable-object-alarm',schedulerStarted,lastScheduledMinute,cronRequired:false,workerType:'durable-object-queue',aiWorkersRunning:false,liveTradingEnabled:false});}
  if(url.pathname==='/enqueue'&&request.method==='POST'){const tasks=await request.json() as Task[],queue=await this.state.storage.get<Task[]>('queue')??[],keys=new Set(queue.map(t=>t.kind+':'+t.symbol+':'+(t.roleId||''))),candidates=tasks.filter(t=>!keys.has(t.kind+':'+t.symbol+':'+(t.roleId||''))),capacity=Math.max(0,500-queue.length),accepted=candidates.slice(0,capacity),rejectedCapacity=candidates.length-accepted.length;await this.state.storage.put('queue',[...queue,...accepted]);if(accepted.length)await this.state.storage.setAlarm(Date.now()+1000);return json({accepted:accepted.length,skippedDuplicates:tasks.length-candidates.length,rejectedCapacity,queued:queue.length+accepted.length});}
  return json({error:'Not found'},404);
 }
 async alarm():Promise<void>{
  const now=Date.now(),minuteKey=new Date(now).toISOString().slice(0,16),lastScheduledMinute=await this.state.storage.get<string>('lastScheduledMinute');
  let queue=await this.state.storage.get<Task[]>('queue')??[];
  if(minuteKey!==lastScheduledMinute){let hasOpenDivisionPositions=false;try{const open=await this.env.DB.prepare("SELECT COUNT(*) AS count FROM division_paper_positions WHERE status IN ('open','closing')").first<any>();hasOpenDivisionPositions=Number(open?.count||0)>0;}catch{}const tasks=buildScheduledScannerTasks(now,this.env.AUTO_PAPER_ENABLED==='true',uuid,hasOpenDivisionPositions);const keys=new Set(queue.map(t=>t.kind+':'+t.symbol+':'+(t.roleId||'')));queue.push(...tasks.filter(t=>!keys.has(t.kind+':'+t.symbol+':'+(t.roleId||''))).slice(0,Math.max(0,500-queue.length)));await this.state.storage.put('lastScheduledMinute',minuteKey);}
  const batch=queue.splice(0,SCANNER_TASKS_PER_ALARM);let processed=0,nextDelay=1000;
  for(const task of batch){try{
    await this.env.DB.batch([
     this.env.DB.prepare("INSERT OR REPLACE INTO agent_task_leases(task_id,owner,lease_until,heartbeat_at,attempts) VALUES(?,?,?,?,?)").bind(task.id,this.state.id.toString(),Date.now()+30_000,Date.now(),task.attempts??0),
     this.env.DB.prepare("UPDATE agent_tasks SET status='running',updated_at=? WHERE id=?").bind(Date.now(),task.id)
    ]);
    if(task.kind==='global-market-scan'){
   const result=await runGlobalMarketScan(this.env,12);
   await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'market:Global Market Discovery','global-market-scan','completed',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify({runId:result.runId,summary:result.summary})).run();
  }else if(task.kind==='market-scan'){
     const result=await runMarketScan(this.env,task.symbol);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'market:Market Data Intelligence','market-scan','completed',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='institutional-scan'){
     const bundle=await marketBundle(this.env,task.symbol),raw=await getJson<Kline[]>(binance(this.env)+'/api/v3/klines?symbol='+encodeURIComponent(task.symbol)+'&interval=1m&limit=120');
     const candles=raw.map(k=>({openTime:Number(k[0]),closeTime:Number(k[6]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
     const trades=(bundle.book.trades??[]).filter((t):t is {price:number;quantity:number;aggressor:'buy'|'sell';timestamp:number}=>t.aggressor==='buy'||t.aggressor==='sell');
     const analysis=analyseInstitutionalMarket({symbol:task.symbol,observedAt:bundle.observedAt,price:bundle.lastPrice,candles,book:bundle.book,trades}),analysisId=uuid(),createdAt=Date.now();
     const enabledRows=await this.env.DB.prepare("SELECT role_id FROM agent_state WHERE enabled=1 AND role_id LIKE 'institutional:%'").all<any>(),enabledRoleIds=new Set(enabledRows.results.map((x:any)=>String(x.role_id)));const roleTasks=analysis.findings.filter(f=>enabledRoleIds.has('institutional:'+f.agent)).map(f=>({id:uuid(),kind:'institutional-role' as const,symbol:task.symbol,createdAt,roleId:'institutional:'+f.agent,correlationId:analysisId,payload:f}));
     if(queue.length+roleTasks.length>500)throw new Error('Durable task queue capacity reached; institutional scan deferred');
     await this.env.DB.batch([
      this.env.DB.prepare('INSERT INTO institutional_analyses(analysis_id,symbol,observed_at,source,result_json) VALUES(?,?,?,?,?)').bind(analysisId,task.symbol,createdAt,'Binance Spot public REST scheduled scan',JSON.stringify(analysis)),
      ...roleTasks.map(t=>this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'queued',?,?,?,NULL)").bind(t.id,t.roleId,'institutional-role-analysis',createdAt,createdAt,JSON.stringify({symbol:task.symbol,analysisId,roleId:t.roleId,finding:t.payload})))
     ]);
     queue.push(...roleTasks);
     await this.env.DB.prepare("UPDATE agent_tasks SET status='completed',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify({analysisId,roleTasks:roleTasks.length}),task.id).run();
     await audit(this.env,'institutional.scheduled.scan.completed','institutional-intelligence-engine',{analysisId,symbol:task.symbol,roleTasks:roleTasks.length});
    }else if(task.kind==='division-position-monitor'){
     const result=await runDivisionPositionMonitor(this.env);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'completed',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'risk:division-position-monitor','division-position-monitor',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='adaptive-division-scan'){
     const result=await runAdaptiveDivisionScan(this.env);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'completed',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'adaptive:division-arbitrator','adaptive-division-scan',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='institutional-strategy-scan'){
     if(this.env.AUTO_PAPER_ENABLED!=='true')throw new Error('Automatic paper strategy workflow is disabled');
     const result=await runInstitutionalStrategyWorkflow(this.env,task.symbol,true);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'completed',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'institutional:supervisor','institutional-strategy-scan',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='amd-forward-scan'){
     const result=await runAmdForwardScan(this.env,task.symbol);
     await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,'completed',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,'institutional:AMD Session Phase Intelligence','amd-forward-scan',task.createdAt,Date.now(),JSON.stringify(task),JSON.stringify(result)).run();
    }else if(task.kind==='institutional-role'&&task.roleId&&task.correlationId){
     const enabledRole=await this.env.DB.prepare('SELECT enabled FROM agent_state WHERE role_id=?').bind(task.roleId).first<any>();
     if(enabledRole?.enabled!==1){await this.env.DB.prepare("UPDATE agent_tasks SET status='cancelled',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify({reason:'Agent was deactivated before execution'}),task.id).run();}
     else{
     const finding=task.payload,rt:RuntimeTask={id:task.id,roleId:task.roleId,departmentId:'institutional',kind:'institutional-role-analysis',symbol:task.symbol,correlationId:task.correlationId,createdAt:task.createdAt,attempts:task.attempts??0,payload:{finding}};
     const evidence=handlerForInstitutionalFinding(finding,rt);
     await this.env.DB.batch([
      this.env.DB.prepare('INSERT OR REPLACE INTO agent_evidence(evidence_id,correlation_id,role_id,observed_at,expires_at,confidence,stance,evidence_json) VALUES(?,?,?,?,?,?,?,?)').bind(evidence.id,task.correlationId,task.roleId,evidence.observedAt,evidence.expiresAt,evidence.confidence,evidence.stance,JSON.stringify(evidence)),
      this.env.DB.prepare("UPDATE agent_tasks SET status='completed',updated_at=?,result_json=? WHERE id=?").bind(Date.now(),JSON.stringify(evidence),task.id),
      this.env.DB.prepare("INSERT INTO agent_messages(message_id,correlation_id,from_role,to_role,message_type,created_at,payload_json) VALUES(?,?,?,?,?,?,?)").bind(uuid(),task.correlationId,task.roleId,'institutional:supervisor','evidence.submitted',Date.now(),JSON.stringify(evidence)),
      this.env.DB.prepare("INSERT INTO agent_state(role_id,enabled,status,heartbeat_at,last_error,updated_at) VALUES(?,0,'COMPLETED',?,NULL,?) ON CONFLICT(role_id) DO UPDATE SET status='COMPLETED',heartbeat_at=excluded.heartbeat_at,last_error=NULL,updated_at=excluded.updated_at").bind(task.roleId,Date.now(),Date.now())
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
     }
    }else throw new Error('Unsupported or malformed runtime task');
    await this.env.DB.prepare('DELETE FROM agent_task_leases WHERE task_id=?').bind(task.id).run();
    await this.env.DB.prepare("INSERT INTO agent_recovery_leases(agent_id,status,attempts,lease_until,max_attempts,idempotency_key,last_error,updated_at) VALUES(?,'completed',?,?,3,?,NULL,?) ON CONFLICT(agent_id) DO UPDATE SET status='completed',lease_until=excluded.lease_until,updated_at=excluded.updated_at,last_error=NULL").bind(task.id,task.attempts??0,Date.now(),task.id,Date.now()).run();
    processed++;
  }catch(error){
    const message=String(error);
    if(/daily row (read|write) limit/i.test(message)){queue.push(task);nextDelay=Math.max(nextDelay,15*60*1000);await this.state.storage.put('lastError',message);continue;}
    try{await this.env.DB.prepare('DELETE FROM agent_task_leases WHERE task_id=?').bind(task.id).run();}catch{}
    const attempts=(task.attempts??0)+1;
    await this.state.storage.put('lastError',message);
    if(attempts<3){queue.push({...task,attempts});nextDelay=Math.max(nextDelay,1000*2**attempts);try{await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,task.roleId??'market:Market Data Intelligence',task.kind,'retrying',task.createdAt,Date.now(),JSON.stringify({...task,attempts}),JSON.stringify({error:message,attempts})).run();}catch{}}
    else{try{await this.env.DB.prepare("INSERT INTO agent_tasks(id,role_id,task_type,status,created_at,updated_at,payload_json,result_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_json=excluded.result_json").bind(task.id,task.roleId??'market:Market Data Intelligence',task.kind,'failed',task.createdAt,Date.now(),JSON.stringify({...task,attempts}),JSON.stringify({error:message,attempts})).run();}catch{}}
    try{await this.env.DB.prepare("INSERT INTO agent_recovery_leases(agent_id,status,attempts,lease_until,max_attempts,idempotency_key,last_error,updated_at) VALUES(?,?,?,?,3,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET status=excluded.status,attempts=excluded.attempts,lease_until=excluded.lease_until,last_error=excluded.last_error,updated_at=excluded.updated_at").bind(task.id,attempts<3?'retrying':'quarantined',attempts,attempts<3?Date.now()+1000*2**attempts:Date.now(),task.id,message,Date.now()).run();}catch{}
  }}
  await this.state.storage.put('queue',queue);await this.state.storage.put('lastProcessedAt',Date.now());await this.state.storage.put('processedCount',(await this.state.storage.get<number>('processedCount')??0)+processed);const nextAlarm=queue.length?Date.now()+nextDelay:(Math.floor(Date.now()/60000)+1)*60000+250;await this.state.storage.setAlarm(nextAlarm);
 }
}
