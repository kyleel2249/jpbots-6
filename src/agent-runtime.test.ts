import { describe, expect, it } from 'vitest';
import { parseCouncilFindings, runDepartmentCouncil, type WorkersAiBinding } from './agent-runtime';
import { departments } from './departments';

const department = departments.find((item) => item.id === 'market')!;
describe('AI specialist council validation', () => {
  it('accepts only exact registered roles and bounded confidence', () => {
    const result = parseCouncilFindings({ findings: [{ roleName: department.agents[0].name, stance: 'bullish', confidence: 72, reason: 'EMA alignment is positive', hardBlock: false }] }, department.agents.slice(0, 1), 'test-model');
    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(1);
  });
  it('rejects unknown roles, invalid confidence and duplicate findings', () => {
    const result = parseCouncilFindings({ findings: [
      { roleName: 'Invented Agent', stance: 'bullish', confidence: 90, reason: 'made up' },
      { roleName: department.agents[0].name, stance: 'bullish', confidence: 150, reason: 'invalid' },
      { roleName: department.agents[0].name, stance: 'bearish', confidence: 40, reason: 'duplicate' }
    ] }, department.agents.slice(0, 1), 'test-model');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.findings).toHaveLength(0);
  });
  it('marks omitted specialist roles as missing instead of pretending they ran', () => {
    const result = parseCouncilFindings({ findings: [] }, department.agents.slice(0, 2), 'test-model');
    expect(result.valid).toBe(false);
    expect(result.missingRoles).toHaveLength(2);
  });
  it('parses a model response and passes only structured inputs', async () => {
    const ai: WorkersAiBinding = { run: async (_model, input) => {
      expect(input.messages[0].role).toBe('system');
      return { response: JSON.stringify({ findings: department.agents.map((role) => ({ roleName: role.name, stance: 'incomplete', confidence: 0, reason: 'Evidence not available' })) }) };
    } };
    const result = await runDepartmentCouncil(ai, 'test-model', department, { symbol: 'BTCUSDT', observedAt: 1, price: 100, marketReport: {}, orderBook: {} });
    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(department.agents.length);
  });
});
