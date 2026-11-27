import {describe,it,expect} from 'vitest';
import {evaluateAdaptiveTrading} from './adaptive-trading';
const base={symbol:'BTCUSDT',assetClass:'crypto',price:60000,direction:'long' as const,observedAt:Date.now(),spreadBps:2,estimatedRoundTripCostBps:5,volatilityPct:0.6,volumeRatio:2,trendAlignment:.8,orderBookImbalance:.7,liquidityUsd:100000,atrPct:1,dataAgeMs:500,sessionEligible:true,fvg:true,liquiditySweep:true,marketStructureShift:true,vwapAligned:true};
describe('adaptive trading arbitrator',()=>{
 it('selects both independent divisions only when both clear strong aligned evidence',()=>{const d=evaluateAdaptiveTrading(base);expect(d.mode).toBe('COMBINATION');expect(d.selected).toHaveLength(2);expect(d.liveTradingEnabled).toBe(false);});
 it('stands down on stale data, excessive costs and thin liquidity',()=>{const d=evaluateAdaptiveTrading({...base,dataAgeMs:90000,estimatedRoundTripCostBps:100,liquidityUsd:1});expect(d.mode).toBe('NEITHER');expect(d.standDown).toBe(true);});
 it('blocks opposing division signals rather than opening conflicting trades',()=>{const d=evaluateAdaptiveTrading({...base,direction:'short',volatilityPct:1.1,trendAlignment:-.8});expect(d.mode).not.toBe('COMBINATION');});
 it('keeps allocations within available capital',()=>{const d=evaluateAdaptiveTrading(base,{totalCapitalUsd:3});expect(d.capital.scalpingUsd+d.capital.dayTradingUsd).toBeLessThanOrEqual(3.000001);});
 it('rejects malformed evidence',()=>{expect(()=>evaluateAdaptiveTrading({...base,price:NaN})).toThrow(/price/);});
 it('treats 98 percent as aspirational, never guaranteed',()=>{const d=evaluateAdaptiveTrading(base);expect(d.kpi.aspirationalReturnPct).toBe(98);expect(d.kpi.guaranteed).toBe(false);});
});
