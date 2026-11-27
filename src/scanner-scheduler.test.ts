import {describe,it,expect} from 'vitest';
import {buildScheduledScannerTasks,SCANNER_TASKS_PER_ALARM,SCANNER_SYMBOLS} from './scanner-scheduler';
const idFactory=()=>{let n=0;return()=>String(++n);};
describe('free-plan scanner scheduling capacity',()=>{
 it('does not create scheduled D1 work during ordinary minutes without open division positions',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,2),true,idFactory());
  expect(tasks).toHaveLength(0);
 });
 it('monitors division positions every minute only while a position is open',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,2),true,idFactory(),true);
  expect(tasks).toHaveLength(1);expect(tasks[0].kind).toBe('division-position-monitor');
 });
 it('runs core and adaptive scans every five minutes with rotating specialist work',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),false,idFactory());
  expect(tasks).toHaveLength(6);
  expect(tasks.filter(t=>t.kind==='market-scan')).toHaveLength(3);
  expect(tasks.filter(t=>t.kind==='institutional-scan')).toHaveLength(1);
  expect(tasks.filter(t=>t.kind==='amd-forward-scan')).toHaveLength(1);
  expect(tasks.filter(t=>t.kind==='adaptive-division-scan')).toHaveLength(1);
  expect(tasks.length).toBeLessThanOrEqual(SCANNER_TASKS_PER_ALARM);
 });
 it('adds one strategy scan only when automatic paper is enabled',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),true,idFactory());
  expect(tasks).toHaveLength(7);
  expect(tasks.filter(t=>t.kind==='institutional-strategy-scan')).toHaveLength(1);
 });
 it('adds global discovery every fifteen minutes without exceeding alarm capacity',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,15),true,idFactory(),true);
  expect(tasks.filter(t=>t.kind==='global-market-scan')).toHaveLength(1);
  expect(tasks.filter(t=>t.kind==='division-position-monitor')).toHaveLength(1);
  expect(tasks.length).toBeLessThanOrEqual(SCANNER_TASKS_PER_ALARM);
 });
 it('rotates specialist suites across all three major symbols over fifteen minutes',()=>{
  const times=[5,10,15].map(m=>Date.UTC(2026,10,27,12,m));
  const symbols=times.map(t=>buildScheduledScannerTasks(t,false,idFactory()).find(x=>x.kind==='institutional-scan')?.symbol);
  expect(new Set(symbols).size).toBe(SCANNER_SYMBOLS.length);
 });
 it('never schedules duplicate task IDs within one tick',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),true,idFactory(),true);
  expect(new Set(tasks.map(t=>t.id)).size).toBe(tasks.length);
 });
});
