export type ParamType = 'Text' | 'Number' | 'Boolean';

export interface QueryParam {
  key: string;
  value: string;
  type: ParamType;
}

export function inferType(value: string): ParamType {
  if (value === 'true' || value === 'false') return 'Boolean';
  if (value !== '' && !Number.isNaN(Number(value))) return 'Number';
  return 'Text';
}

export function parseQueryString(input: string): QueryParam[] {
  const trimmed = input.trim().replace(/^[?#]/, '');
  if (trimmed === '') return [];
  const search = new URLSearchParams(trimmed);
  return Array.from(search.entries()).map(([key, value]) => ({ key, value, type: inferType(value) }));
}

export function buildQueryString(params: QueryParam[]): string {
  const search = new URLSearchParams();
  for (const param of params) {
    if (param.key === '') continue;
    search.append(param.key, param.value);
  }
  return search.toString();
}

function coerceValue(param: QueryParam): string | number | boolean {
  if (param.type === 'Number') {
    const numeric = Number(param.value);
    return Number.isNaN(numeric) ? param.value : numeric;
  }
  if (param.type === 'Boolean') return param.value === 'true';
  return param.value;
}

export function paramsToJson(params: QueryParam[]): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const param of params) {
    if (param.key === '') continue;
    result[param.key] = coerceValue(param);
  }
  return result;
}

export interface ParseJsonResult {
  ok: boolean;
  params: QueryParam[];
  message?: string;
}

export function jsonToParams(input: string): ParseJsonResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, params: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, params: [], message: 'That is not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, params: [], message: 'JSON must be a flat object of key and value pairs.' };
  }
  const params = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === 'number') return { key, value: String(value), type: 'Number' as const };
    if (typeof value === 'boolean') return { key, value: String(value), type: 'Boolean' as const };
    return { key, value: String(value), type: 'Text' as const };
  });
  return { ok: true, params };
}
