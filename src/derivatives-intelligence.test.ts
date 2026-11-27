import {describe,it,expect} from 'vitest';
import {assessDerivatives} from './derivatives-intelligence';
const now=1_800_000_000_000;
const sample={observedAt:now,fundingRate:.0008,nextFundingTime:now+28_800_000,markPrice:100.1,indexPrice:100,openInterest:123456,openInterestTime:now};
describe('derivatives intelligence',()=>{
 it('reports funding, mark basis and open interest without treating them as a trade signal',()=>{const r=assessDerivatives(sample,100,now);expect(r.status).toBe('available');expect(r.funding?.condition).toBe('crowded-long-risk');expect(r.openInterest?.contracts).toBe(123456);expect(r.warnings.length).toBeGreaterThan(0);});
 it('degrades safely when derivatives data is unavailable',()=>{const r=assessDerivatives(null,100,now);expect(r.status).toBe('unavailable');expect(r.funding).toBeNull();});
 it('rejects malformed observations',()=>{const r=assessDerivatives({...sample,markPrice:NaN},100,now);expect(r.status).toBe('unavailable');});
 it('flags stale observations',()=>{const r=assessDerivatives({...sample,observedAt:now-120_000,openInterestTime:now-180_000},100,now);expect(r.warnings.some(x=>x.includes('stale'))).toBe(true);});
});
