import type {Agent} from './types';
import {allAgentRoles} from './departments';
// These are registered specialist definitions, not running worker processes.
export const initialAgents:Agent[]=allAgentRoles.map((r,i)=>({
 id:i+1,
 roleId:r.departmentId+':'+r.name,
 name:r.name.replace(/ Agent$/,''),
 division:r.department,
 strategy:r.task,
 symbol:'—',
 timeframe:r.department==='Scalping'?'1m/3m/5m':r.department==='Day Trading'?'5m/15m/30m/1h/4h':'MULTI-TIMEFRAME',
 status:'PAUSED',enabled:false,
 confidence:0,trades:0,winRate:0,pnl:0,risk:0
}));
