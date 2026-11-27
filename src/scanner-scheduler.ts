export type ScannerTaskKind='market-scan'|'institutional-scan'|'amd-forward-scan'|'institutional-strategy-scan'|'global-market-scan';
export type ScheduledScannerTask={id:string;kind:ScannerTaskKind;symbol:string;createdAt:number;roleId?:string};
export const SCANNER_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT'] as const;
// Global discovery is added every 15 minutes. Specialist work fans out after each
// institutional scan, so keep enough alarm throughput to drain the bounded burst.
export const SCANNER_TASKS_PER_ALARM=16;
export function buildScheduledScannerTasks(now:number,autoPaperEnabled:boolean,makeId:()=>string):ScheduledScannerTask[]{
 const tasks:ScheduledScannerTask[]=SCANNER_SYMBOLS.map(symbol=>({id:makeId(),kind:'market-scan',symbol,createdAt:now}));
 if(new Date(now).getUTCMinutes()%15===0)tasks.push({id:makeId(),kind:'global-market-scan',symbol:'GLOBAL',createdAt:now});
 if(new Date(now).getUTCMinutes()%5===0){
  for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'institutional-scan',symbol,createdAt:now});
  for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'amd-forward-scan',symbol,createdAt:now});
  if(autoPaperEnabled)for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'institutional-strategy-scan',symbol,createdAt:now});
 }
 return tasks;
}
