import {describe,it,expect} from 'vitest';
import {arbitrateRuntimeEvidence,planAutonomousPaperWorkflow,createInstitutionalHandlers,type RuntimeEvidence} from './autonomous-runtime';
import {analyseInstitutionalMarket,type InstitutionalInput} from './institutional-intelligence';
const evidence=(i:number,stance:RuntimeEvidence['stance']='bullish'):RuntimeEvidence=>({id:String(i),roleId:'institutional:'+i,stance,confidence:70,observedAt:1000,expiresAt:100000,summary:'Independent market evidence',source:'test',hardBlock:false});
const candles=Array.from({length:10},(_,i)=>({openTime:i,closeTime:i+1,open:100+i,high:102+i,low:99+i,close:101+i,volume:100}));
const input:InstitutionalInput={symbol:'BTCUSDT',observedAt:10000,price:110,candles,book:{symbol:'BTCUSDT',timestamp:10000,mid:110,bids:[{price:109.9,quantity:10}],asks:[{price:110.1,quantity:10}],trades:[]},trades:[]};
describe('autonomous institutional runtime',()=>{
 it('requires fresh evidence and independent directional agreement',()=>{const r=arbitrateRuntimeEvidence([evidence(1),evidence(2),evidence(3)],2000);expect(r.stance).toBe('bullish');expect(r.approved).toBe(false);});
 it('lets risk evidence veto a unanimous directional vote',()=>{const r=arbitrateRuntimeEvidence([evidence(1),evidence(2),evidence(3),{...evidence(4),'stance':'risk',hardBlock:true}],2000);expect(r.stance).toBe('risk');expect(r.approved).toBe(false);});
 it('rejects expired evidence',()=>{const r=arbitrateRuntimeEvidence([{...evidence(1),expiresAt:1500}],2000);expect(r.evidenceCount).toBe(0);});
 it('creates ten independently addressable handlers',async()=>{const a=analyseInstitutionalMarket(input),h=createInstitutionalHandlers(a);expect(h.size).toBe(10);const task={id:'t',roleId:'institutional:Institutional Order-Flow Analysis',departmentId:'institutional',kind:'analysis',symbol:'BTCUSDT',correlationId:'c',createdAt:10000,attempts:0,payload:{}};expect((await h.get(task.roleId)!(task)).roleId).toBe(task.roleId);});
 it('never readies a paper order without strategy, timeframe, execution and capital qualification',()=>{const a=analyseInstitutionalMarket(input),r=arbitrateRuntimeEvidence([evidence(1),evidence(2),evidence(3)],2000),p=planAutonomousPaperWorkflow({analysis:a,runtimeDecision:r,strategyValidated:false,multiTimeframeAligned:false,marketDataFresh:true,executionEconomicsValid:false,capitalApproved:false,entry:110,stop:108,target:114});expect(p.ready).toBe(false);expect(p.liveExecutionEnabled).toBe(false);expect(p.entry).toBeNull();});
});
