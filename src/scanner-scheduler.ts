export type ScannerTaskKind='market-scan'|'institutional-scan'|'amd-forward-scan'|'institutional-strategy-scan';
export type ScheduledScannerTask={id:string;kind:ScannerTaskKind;symbol:string;createdAt:number;roleId?:string};
export const SCANNER_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT'] as const;
// Average load is 3 market tasks/minute plus 36 institutional specialist tasks,
// 6 AMD tasks and 6 optional strategy tasks per five minutes. A 12-task alarm
// batch drains the five-minute burst before the next scheduled burst.
export const SCANNER_TASKS_PER_ALARM=12;
export function buildScheduledScannerTasks(now:number,autoPaperEnabled:boolean,makeId:()=>string):ScheduledScannerTask[]{
 const tasks:ScheduledScannerTask[]=SCANNER_SYMBOLS.map(symbol=>({id:makeId(),kind:'market-scan',symbol,createdAt:now}));
 if(new Date(now).getUTCMinutes()%5===0){
  for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'institutional-scan',symbol,createdAt:now});
  for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'amd-forward-scan',symbol,createdAt:now});
  if(autoPaperEnabled)for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'institutional-strategy-scan',symbol,createdAt:now});
 }
 return tasks;
}
