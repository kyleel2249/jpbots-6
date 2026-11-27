export type ExchangeQuote={exchange:string;symbol:string;observedAt:number;sequence?:number;bid:number;ask:number;bidDepth:number;askDepth:number;bids?:{price:number;quantity:number}[];asks?:{price:number;quantity:number}[];source:string};
export type DerivativePoint={observedAt:number;fundingRate:number;openInterest:number};
export type LiquidationEvent={observedAt:number;side:'long'|'short';price:number;quantity:number;source:string};
export type LiquidityLevel={price:number;bidNotional:number;askNotional:number;netNotional:number;kind:'support'|'resistance'|'balanced'};
export type SpecialistEvidence={agent:string;direction:'bullish'|'bearish'|'neutral';score:number;confidence:number;observations:string[];provenance:string[];valid:boolean};
export type StrategyGenome={id:string;fast:number;slow:number;entryThreshold:number;stopAtr:number;targetR:number;maxSpreadBps:number};
export type DecisionEvent={sequence:number;at:number;kind:string;payload:unknown;previousHash:string;hash:string};
const finite=(n:number)=>Number.isFinite(n);
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const median=(xs:number[])=>{const a=[...xs].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:0;};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function synchroniseExchanges(quotes:ExchangeQuote[],now:number,maxAgeMs=15_000,maxSkewBps=35){
 const valid=quotes.filter(q=>q.exchange&&q.symbol&&q.source&&finite(q.observedAt)&&q.observedAt>0&&q.observedAt<=now+2_000&&now-q.observedAt<=maxAgeMs&&finite(q.bid)&&finite(q.ask)&&q.bid>0&&q.ask>q.bid&&finite(q.bidDepth)&&q.bidDepth>=0&&finite(q.askDepth)&&q.askDepth>=0);
 const symbols=[...new Set(valid.map(q=>q.symbol))];if(symbols.length>1)throw new Error('Cannot synchronise different symbols');
 const dedup=new Map<string,ExchangeQuote>();for(const q of valid){const old=dedup.get(q.exchange);if(!old||q.observedAt>old.observedAt||(q.observedAt===old.observedAt&&(q.sequence??0)>(old.sequence??0)))dedup.set(q.exchange,q);}
 const selected=[...dedup.values()],mids=selected.map(q=>(q.bid+q.ask)/2),reference=median(mids),skewBps=reference?Math.max(...mids.map(x=>Math.abs(x/reference-1)*10000)):0;
 return {symbol:symbols[0]??null,exchanges:selected.map(q=>q.exchange),referencePrice:reference||null,skewBps,healthy:selected.length>=2&&skewBps<=maxSkewBps,staleOrInvalidCount:quotes.length-selected.length,quotes:selected,reason:selected.length<2?'Fewer than two fresh independent exchanges':skewBps>maxSkewBps?'Cross-exchange price skew exceeds tolerance':null};
}
export function buildLiquidityMap(quotes:ExchangeQuote[],referencePrice:number,bucketBps=5){
 if(!finite(bucketBps)||bucketBps<=0||!finite(referencePrice)||referencePrice<=0)throw new Error('Liquidity reference price and bucket size must be positive');
 const bucketSize=referencePrice*bucketBps/10000,buckets=new Map<number,{bidNotional:number;askNotional:number}>();
 for(const q of quotes){const sides=[['bid',q.bids??[{price:q.bid,quantity:q.bidDepth}]],['ask',q.asks??[{price:q.ask,quantity:q.askDepth}]]] as const;for(const [side,levels] of sides){for(const level of levels){const price=level.price,quantity=level.quantity,key=Math.round(price/bucketSize);const b=buckets.get(key)??{bidNotional:0,askNotional:0};if(side==='bid')b.bidNotional+=price*quantity;else b.askNotional+=price*quantity;buckets.set(key,b);}}}
 return [...buckets.entries()].map(([key,v])=>{const price=key*bucketSize;return {price,bidNotional:v.bidNotional,askNotional:v.askNotional,netNotional:v.bidNotional-v.askNotional,kind:v.bidNotional>v.askNotional*1.25?'support' as const:v.askNotional>v.bidNotional*1.25?'resistance' as const:'balanced' as const};}).sort((a,b)=>b.netNotional-a.netNotional);
}
export function analyseLiquidations(events:LiquidationEvent[],now:number,maxAgeMs=86_400_000){
 const valid=events.filter(e=>finite(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=maxAgeMs&&finite(e.price)&&e.price>0&&finite(e.quantity)&&e.quantity>0&&['long','short'].includes(e.side)&&!!e.source);
 const long=valid.filter(e=>e.side==='long').reduce((s,e)=>s+e.price*e.quantity,0),short=valid.filter(e=>e.side==='short').reduce((s,e)=>s+e.price*e.quantity,0);
 return {status:valid.length?'available' as const:'unavailable' as const,eventCount:valid.length,longLiquidationNotional:long,shortLiquidationNotional:short,netShortMinusLong:short-long,latestAt:valid.length?Math.max(...valid.map(e=>e.observedAt)):null,sourceNames:[...new Set(valid.map(e=>e.source))],limitations:valid.length?['Liquidation observations are venue-specific and incomplete; absence is not proof of no liquidations.']:['No verified historical liquidation feed is configured. Binance public REST does not provide a complete historical liquidation tape; no events are fabricated.']};
}
export function buildSpecialistDebate(input:{trendPct:number;depthImbalance:number;tradeDelta:number;fundingRate:number|null;openInterestChangePct:number|null;liquidations:ReturnType<typeof analyseLiquidations>;exchangeHealthy:boolean;spreadBps:number}):{evidence:SpecialistEvidence[];consensus:'bullish'|'bearish'|'contested'|'no-edge';score:number;vetoes:string[]}{
 const make=(agent:string,score:number,observations:string[],provenance:string[],valid=true):SpecialistEvidence=>({agent,direction:score>.12?'bullish':score<-.12?'bearish':'neutral',score:clamp(score,-1,1),confidence:valid?clamp(Math.abs(score)*100,0,100):0,observations,provenance,valid});
 const evidence=[
 make('Trend Specialist',Math.tanh(input.trendPct/1.5),['Measures recent price drift independently of order flow'],['closed spot candles']),
 make('Order Flow Specialist',input.tradeDelta,['Uses aggressor-side traded notional'],['public aggregate trades']),
 make('Liquidity Structure Specialist',input.depthImbalance,['Compares bid and ask displayed depth'],['venue order books']),
 make('Derivatives Positioning Specialist',input.fundingRate===null?0:-Math.tanh(input.fundingRate*1500),[input.fundingRate===null?'Funding unavailable':'Funding is treated as crowding context, not direction'],['public funding history'],input.fundingRate!==null),
 make('Liquidation Specialist',input.liquidations.status==='unavailable'?0:Math.tanh(input.liquidations.netShortMinusLong/100000),[input.liquidations.status==='unavailable'?'No verified liquidation tape':'Compares reported long and short liquidation notional'],input.liquidations.sourceNames,input.liquidations.status==='available'),
 make('Open Interest Specialist',input.openInterestChangePct===null?0:Math.tanh(input.openInterestChangePct/2),[input.openInterestChangePct===null?'Historical open-interest change unavailable':'Compares change in open interest'],['historical futures open-interest observations'],input.openInterestChangePct!==null)
 ];
 const active=evidence.filter(e=>e.valid&&e.direction!=='neutral'),bull=active.filter(e=>e.direction==='bullish').length,bear=active.filter(e=>e.direction==='bearish').length,score=mean(evidence.filter(e=>e.valid).map(e=>e.score));
 const vetoes:string[]=[];if(!input.exchangeHealthy)vetoes.push('Cross-exchange synchronisation is unhealthy');if(input.spreadBps>25)vetoes.push('Spread exceeds 25 bps');if(Math.abs(score)<.15||bull===bear)vetoes.push('Specialist evidence is contested or has no directional edge');
 return {evidence,consensus:vetoes.some(v=>v.includes('contested'))?'contested':bull>bear&&score>.15?'bullish':bear>bull&&score<-.15?'bearish':'no-edge',score,vetoes};
}
export function adversarialStrategyTest(genome:StrategyGenome,scenarios:{name:string;spreadMultiplier:number;slippageBps:number;missRate:number;latencyMs:number}[]){
 const failures:string[]=[];if(genome.fast<2||genome.slow<=genome.fast||genome.entryThreshold<0||genome.stopAtr<=0||genome.targetR<=0||genome.maxSpreadBps<=0)failures.push('Invalid strategy genome');
 const results=scenarios.map(s=>{const passed=finite(s.spreadMultiplier)&&s.spreadMultiplier>=1&&s.spreadMultiplier*genome.maxSpreadBps<=genome.maxSpreadBps*1.5&&finite(s.slippageBps)&&s.slippageBps<=genome.maxSpreadBps&&finite(s.missRate)&&s.missRate>=0&&s.missRate<=.25&&finite(s.latencyMs)&&s.latencyMs<=2000;return {scenario:s.name,passed,reason:passed?'within stress envelope':'execution stress exceeds strategy limits'};});
 return {passed:failures.length===0&&results.every(x=>x.passed),failures,scenarios:results};
}
export function evolveStrategies(seed:StrategyGenome[],fitness:(g:StrategyGenome)=>number,generations=3,population=20){
 if(!seed.length||generations<1||generations>20||population<4||population>100)throw new Error('Invalid evolutionary search bounds');
 let pool=[...seed];const history:{generation:number;bestFitness:number;best:StrategyGenome}[]=[];
 for(let gen=0;gen<generations;gen++){const ranked=pool.map(g=>({g,score:fitness(g)})).filter(x=>finite(x.score)).sort((a,b)=>b.score-a.score);if(!ranked.length)throw new Error('No finite strategy fitness values');const elite=ranked.slice(0,Math.max(2,Math.floor(population/4))).map(x=>x.g);history.push({generation:gen,bestFitness:ranked[0].score,best:ranked[0].g});pool=[...elite];while(pool.length<population){const p=elite[pool.length%elite.length],n=pool.length;pool.push({...p,id:p.id+'-g'+gen+'-'+n,fast:clamp(p.fast+(n%3)-1,2,50),slow:clamp(p.slow+(n%5)-2,p.fast+1,200),entryThreshold:clamp(p.entryThreshold+((n%3)-1)*.05,0,2),stopAtr:clamp(p.stopAtr+((n%4)-1.5)*.1,.5,5),targetR:clamp(p.targetR+((n%3)-1)*.25,.5,8),maxSpreadBps:clamp(p.maxSpreadBps+(n%3)-1,1,50)});}}
 const final=pool.map(g=>({genome:g,fitness:fitness(g)})).filter(x=>finite(x.fitness)).sort((a,b)=>b.fitness-a.fitness);
 return {best:final[0]??null,history,finalPopulation:final.length,holdoutRequired:true,livePromotion:false};
}

export function scoreStrategyGenome(genome:StrategyGenome,closes:number[],feeBps=10,slippageBps=5){
 if(closes.length<genome.slow+5||closes.some(p=>!finite(p)||p<=0))return -1e6;
 const sma=(end:number,period:number)=>mean(closes.slice(end-period,end));
 let position=0,entry=0,equity=1,peak=1,maxDrawdown=0,trades=0,wins=0;
 for(let i=genome.slow;i<closes.length;i++){const fast=sma(i,genome.fast),slow=sma(i,genome.slow),price=closes[i],cost=(feeBps+slippageBps)*2/10000;
  if(position===0&&fast>slow*(1+genome.entryThreshold/100)){position=1;entry=price*(1+cost/2);}
  else if(position===1&&(fast<slow||price<=entry*(1-genome.stopAtr/100)||price>=entry*(1+genome.targetR*genome.stopAtr/100))){const result=price*(1-cost/2)/entry-1;equity*=1+result;trades++;if(result>0)wins++;position=0;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);}
 }
 if(position){const result=closes.at(-1)!*(1-(feeBps+slippageBps)/10000)/entry-1;equity*=1+result;trades++;if(result>0)wins++;}
 if(trades<3)return -1000+trades;
 const net=equity-1;return net-maxDrawdown*1.5+(wins/trades)*.05;
}
export function calculatePortfolioRisk(returns:Record<string,number[]>,confidence=.95){
 const symbols=Object.keys(returns).sort(),series=symbols.map(s=>returns[s].filter(finite));
 const n=Math.min(...series.map(x=>x.length));if(symbols.length===0||n<20||confidence<=.5||confidence>=1)throw new Error('At least one asset and 20 aligned returns with confidence in (0.5,1) are required');
 const aligned=series.map(x=>x.slice(-n)),means=aligned.map(mean),corr=symbols.map((_,i)=>symbols.map((__,j)=>{const a=aligned[i],b=aligned[j],ma=means[i],mb=means[j],cov=mean(a.map((v,k)=>(v-ma)*(b[k]-mb))),den=Math.sqrt(mean(a.map(v=>(v-ma)**2))*mean(b.map(v=>(v-mb)**2)));return den?cov/den:0;}));
 const portfolio=Array.from({length:n},(_,k)=>mean(aligned.map(x=>x[k]))).sort((a,b)=>a-b),index=Math.max(0,Math.floor((1-confidence)*n)),varLoss=-portfolio[index],tail=portfolio.slice(0,index+1),cvarLoss=-mean(tail);
 return {symbols,sampleCount:n,confidence,correlation:corr.map((row,i)=>({symbol:symbols[i],values:row})),historicalVaR:varLoss,historicalCVaR:cvarLoss,tailSampleCount:tail.length,limitations:['Equal-weight portfolio approximation; supply actual portfolio weights for production allocation.','Historical tail risk does not guarantee future loss bounds.','Decision-event checksums detect accidental tampering but are not cryptographic signatures.']};
}
export function simulateSmartExecution(input:{side:'buy'|'sell';quantity:number;levels:{price:number;quantity:number}[];referencePrice:number;feeBps:number;maxSlippageBps:number;latencyMs:number;queuePenaltyBps?:number}){
 if(!finite(input.quantity)||input.quantity<=0||!finite(input.referencePrice)||input.referencePrice<=0||!finite(input.feeBps)||input.feeBps<0||!finite(input.maxSlippageBps)||input.maxSlippageBps<0||!finite(input.latencyMs)||input.latencyMs<0||input.levels.some(l=>!finite(l.price)||l.price<=0||!finite(l.quantity)||l.quantity<0))throw new Error('Invalid execution simulation inputs');
 let remaining=input.quantity,filled=0,value=0;const fills:{price:number;quantity:number;notional:number}[]=[];
 for(const level of input.levels){const q=Math.min(remaining,level.quantity);if(q>0){fills.push({price:level.price,quantity:q,notional:q*level.price});filled+=q;value+=q*level.price;remaining-=q;}if(remaining<=1e-12)break;}
 const averagePrice=filled?value/filled:null,rawSlippageBps=averagePrice===null?null:Math.abs(averagePrice/input.referencePrice-1)*10000,latencyPenaltyBps=input.latencyMs/1000*.5,queuePenaltyBps=input.queuePenaltyBps??0,totalSlippageBps=rawSlippageBps===null?null:rawSlippageBps+latencyPenaltyBps+queuePenaltyBps,complete=remaining<=1e-12;
 return {complete,filledQuantity:filled,unfilledQuantity:remaining,averagePrice,notional:value,fees:value*input.feeBps/10000,rawSlippageBps,totalSlippageBps,accepted:complete&&totalSlippageBps!==null&&totalSlippageBps<=input.maxSlippageBps,levelsConsumed:fills.length,fills,reason:!complete?'Insufficient displayed depth':totalSlippageBps!==null&&totalSlippageBps>input.maxSlippageBps?'Execution cost exceeds configured ceiling':null};
}
export function makeDecisionEvent(sequence:number,at:number,kind:string,payload:unknown,previousHash='GENESIS'):DecisionEvent{
 const canonical=(v:any):string=>v===null?'null':typeof v==='number'?Number.isFinite(v)?String(v):'null':typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?String(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':'null';
 const text=sequence+'|'+at+'|'+kind+'|'+canonical(payload)+'|'+previousHash;let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return {sequence,at,kind,payload,previousHash,hash:(h>>>0).toString(16).padStart(8,'0')};
}
export function verifyDecisionReplay(events:DecisionEvent[]){
 let previous='GENESIS';for(let i=0;i<events.length;i++){const e=events[i];if(e.sequence!==i+1||e.previousHash!==previous)return {valid:false,failedAt:i+1,reason:'Sequence or hash-chain predecessor mismatch'};const rebuilt=makeDecisionEvent(e.sequence,e.at,e.kind,e.payload,previous);if(rebuilt.hash!==e.hash)return {valid:false,failedAt:i+1,reason:'Decision payload hash mismatch'};previous=e.hash;}return {valid:true,eventCount:events.length,finalHash:previous};
}
export function recoverAgentState(state:{status:string;attempts:number;leaseUntil:number;maxAttempts:number},now:number){
 if(!finite(state.attempts)||state.attempts<0||!finite(state.leaseUntil)||!finite(now))return {action:'quarantine' as const,reason:'Malformed agent lease or retry state'};
 if(state.status==='completed'||state.status==='cancelled')return {action:'no-op' as const,reason:'Terminal agent state'};
 if(state.leaseUntil>now)return {action:'wait' as const,reason:'Agent lease remains active'};
 if(state.attempts>=state.maxAttempts)return {action:'quarantine' as const,reason:'Retry budget exhausted'};
 return {action:'retry' as const,reason:'Expired lease can be safely retried with idempotency key'};
}
