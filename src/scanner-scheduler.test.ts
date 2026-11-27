import {describe,it,expect} from 'vitest';
import {buildScheduledScannerTasks,SCANNER_TASKS_PER_ALARM} from './scanner-scheduler';
const idFactory=()=>{let n=0;return()=>String(++n);};
describe('scanner scheduling capacity',()=>{
 it('schedules only lightweight market scans during ordinary minutes',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,2),true,idFactory());
  expect(tasks).toHaveLength(3);expect(tasks.every(t=>t.kind==='market-scan')).toBe(true);
 });
 it('schedules institutional and AMD work in a bounded five-minute burst',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),false,idFactory());
  expect(tasks).toHaveLength(9);
  expect(tasks.filter(t=>t.kind==='institutional-scan')).toHaveLength(3);
  expect(tasks.filter(t=>t.kind==='amd-forward-scan')).toHaveLength(3);
 });
 it('adds strategy scans only when explicitly enabled',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),true,idFactory());
  expect(tasks).toHaveLength(12);
  expect(tasks.filter(t=>t.kind==='institutional-strategy-scan')).toHaveLength(3);
  expect(SCANNER_TASKS_PER_ALARM).toBe(12);
 });
 it('never schedules duplicate task IDs or symbols within one tick',()=>{
  const tasks=buildScheduledScannerTasks(Date.UTC(2026,10,27,12,5),true,idFactory());
  expect(new Set(tasks.map(t=>t.id)).size).toBe(tasks.length);
  expect(new Set(tasks.filter(t=>t.kind==='market-scan').map(t=>t.symbol)).size).toBe(3);
 });
});
