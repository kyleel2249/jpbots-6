export type AgentStatus='SCANNING'|'ANALYSING'|'READY'|'IN_POSITION'|'COOLDOWN'|'PAUSED';
export type Agent={id:number;name:string;division:string;strategy:string;symbol:string;timeframe:string;status:AgentStatus;confidence:number;trades:number;winRate:number;pnl:number;risk:number};
export type Signal={id:number;time:string;symbol:string;side:'LONG'|'SHORT';strategy:string;confidence:number;agent:string;status:'WATCH'|'APPROVED'|'REJECTED'|'PAPER_FILLED'};
export type Market={symbol:string;price:number;change:number;volume:string;funding:string};