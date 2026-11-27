import type {Agent} from './types';
import {allAgentRoles} from './departments';
// These are registered specialist definitions, not running worker processes.
export const initialAgents:Agent[]=allAgentRoles.map((r,i)=>({
 id:i+1,
 name:r.name.replace(/ Agent$/,''),
 division:r.department,
 strategy:r.task,
 symbol:r.department.includes('Solana')?'SOL/USDC':'BTC/USDT',
 timeframe:r.department==='Scalping'?'1m':r.department==='Day Trading'?'15m':'1h',
 status:'REGISTERED',
 confidence:0,trades:0,winRate:0,pnl:0,risk:.2
}));
