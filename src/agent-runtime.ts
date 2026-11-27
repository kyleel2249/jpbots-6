import type { Department, Role } from './departments';

export type AgentStance = 'bullish' | 'bearish' | 'neutral' | 'risk' | 'incomplete';
export type SpecialistFinding = {
  roleName: string;
  stance: AgentStance;
  confidence: number;
  reason: string;
  hardBlock: boolean;
};
export type CouncilResult = {
  valid: boolean;
  findings: SpecialistFinding[];
  missingRoles: string[];
  errors: string[];
  model: string;
  promptVersion: 'department-council-v1';
};
export interface WorkersAiBinding {
  run(model: string, input: {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }): Promise<unknown>;
}

const stances = new Set<AgentStance>(['bullish', 'bearish', 'neutral', 'risk', 'incomplete']);
function responseText(value: any): string {
  if (typeof value === 'string') return value;
  if (typeof value?.response === 'string') return value.response;
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('\n');
  return '';
}
export function parseCouncilFindings(value: unknown, roles: Role[], model: string): CouncilResult {
  const errors: string[] = [];
  const expected = new Set(roles.map((role) => role.name));
  const findings: SpecialistFinding[] = [];
  const seen = new Set<string>();
  const items = (value as any)?.findings;
  if (!Array.isArray(items)) errors.push('model response must contain a findings array');
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.roleName !== 'string' || !expected.has(item.roleName)) {
      errors.push('response contains an unknown specialist role');
      continue;
    }
    if (seen.has(item.roleName)) {
      errors.push('response contains a duplicate specialist role: ' + item.roleName);
      continue;
    }
    if (!stances.has(item.stance) || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 100 || typeof item.reason !== 'string' || !item.reason.trim()) {
      errors.push('invalid finding fields for ' + item.roleName);
      continue;
    }
    if (item.hardBlock !== undefined && typeof item.hardBlock !== 'boolean') {
      errors.push('hardBlock must be boolean for ' + item.roleName);
      continue;
    }
    seen.add(item.roleName);
    findings.push({ roleName: item.roleName, stance: item.stance, confidence: item.confidence, reason: item.reason.trim().slice(0, 600), hardBlock: item.hardBlock === true });
  }
  const missingRoles = roles.map((role) => role.name).filter((name) => !seen.has(name));
  if (missingRoles.length) errors.push('model omitted ' + missingRoles.length + ' specialist role findings');
  return { valid: errors.length === 0, findings, missingRoles, errors, model, promptVersion: 'department-council-v1' };
}

export async function runDepartmentCouncil(
  ai: WorkersAiBinding,
  model: string,
  department: Department,
  context: { symbol: string; observedAt: number; price: number; marketReport: unknown; orderBook: unknown }
): Promise<CouncilResult> {
  const system = [
    'You are the supervisor coordinating a department of specialist market-analysis agents.',
    'Return exactly one finding for every specialist role supplied. Use only the supplied market context.',
    'Do not invent prices, order-book levels, news, macro data, trader records, fills, or account facts.',
    'If a role lacks the data or provider required for its task, return stance "incomplete", confidence 0, and explain the missing evidence.',
    'A finding is analysis only. Never claim an order was placed, a trade was authorised, or a live position exists.',
    'Return JSON only, shaped as {"findings":[{"roleName":"exact role name","stance":"bullish|bearish|neutral|risk|incomplete","confidence":0,"reason":"short evidence-based explanation","hardBlock":false}]}',
    'Confidence is a calibrated evidence-strength estimate, not a probability of profit. Do not fabricate certainty.'
  ].join(' ');
  const user = JSON.stringify({
    department: { id: department.id, name: department.name, mandate: department.mandate },
    specialistRoles: department.agents.map((role) => ({ roleName: role.name, responsibility: role.task })),
    marketContext: context
  });
  const raw = await ai.run(model, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.1, max_tokens: 4096 });
  const text = responseText(raw).trim();
  if (!text) return { valid: false, findings: [], missingRoles: department.agents.map((role) => role.name), errors: ['AI provider returned an empty response'], model, promptVersion: 'department-council-v1' };
  const candidate = text.trim().replace(/^`{3}(?:json)?\s*/i, '').replace(/\s*`{3}$/, '');
  let parsed: unknown;
  try {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    parsed = JSON.parse(first >= 0 && last > first ? candidate.slice(first, last + 1) : candidate);
  } catch {
    return { valid: false, findings: [], missingRoles: department.agents.map((role) => role.name), errors: ['AI response was not valid JSON'], model, promptVersion: 'department-council-v1' };
  }
  return parseCouncilFindings(parsed, department.agents, model);
}
