export type ScannerTaskKind='market-scan'|'institutional-scan'|'amd-forward-scan'|'institutional-strategy-scan'|'global-market-scan'|'adaptive-division-scan'|'division-position-monitor';
export type ScheduledScannerTask={id:string;kind:ScannerTaskKind;symbol:string;createdAt:number;roleId?:string};
export const SCANNER_SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT'] as const;
// The Free-plan schedule is deliberately bounded: core scans run every five minutes,
// specialist suites rotate across the three majors, and position monitoring is added
// only while division paper positions are open.
export const SCANNER_TASKS_PER_ALARM=16;
export function buildScheduledScannerTasks(now:number,autoPaperEnabled:boolean,makeId:()=>string,hasOpenDivisionPositions=false):ScheduledScannerTask[]{
 const tasks:ScheduledScannerTask[]=[],minute=new Date(now).getUTCMinutes();
 if(hasOpenDivisionPositions)tasks.push({id:makeId(),kind:'division-position-monitor',symbol:'GLOBAL',createdAt:now});
 if(minute%5===0){
  for(const symbol of SCANNER_SYMBOLS)tasks.push({id:makeId(),kind:'market-scan',symbol,createdAt:now});
  tasks.push({id:makeId(),kind:'adaptive-division-scan',symbol:'GLOBAL',createdAt:now});
  const slot=Math.floor(now/300000)%SCANNER_SYMBOLS.length,symbol=SCANNER_SYMBOLS[slot];
  tasks.push({id:makeId(),kind:'institutional-scan',symbol,createdAt:now});
  tasks.push({id:makeId(),kind:'amd-forward-scan',symbol,createdAt:now});
  if(autoPaperEnabled)tasks.push({id:makeId(),kind:'institutional-strategy-scan',symbol,createdAt:now});
 }
 if(minute%15===0)tasks.push({id:makeId(),kind:'global-market-scan',symbol:'GLOBAL',createdAt:now});
 return tasks;
}
