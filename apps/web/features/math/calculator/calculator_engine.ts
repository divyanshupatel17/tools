export type CalculatorOperator = '+' | '-' | '×' | '÷';

const OPERATORS: readonly CalculatorOperator[] = ['+', '-', '×', '÷'];

export function isOperatorToken(token: string): token is CalculatorOperator {
  return (OPERATORS as readonly string[]).includes(token);
}

const MAX_INTEGER_DIGITS = 15;

export interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
}

export interface CalculatorState {
  tokens: string[];
  freshResult: boolean;
  preview: string | null;
  errorMessage: string | null;
  history: HistoryEntry[];
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: CalculatorOperator }
  | { type: 'equals' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'toggle-sign' }
  | { type: 'percent' }
  | { type: 'clear-history' };

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  tokens: [],
  freshResult: false,
  preview: null,
  errorMessage: null,
  history: [],
};

function digitCount(raw: string): number {
  return raw.replace(/[^0-9]/g, '').length;
}

/** Last token, only ever called after confirming the array is non empty. */
function lastToken(tokens: readonly string[]): string {
  return tokens[tokens.length - 1] as string;
}

/** Renders a raw token (which may still have a trailing "." while typing) with thousands separators. */
export function formatNumberToken(raw: string): string {
  const negative = raw.startsWith('-');
  const magnitude = negative ? raw.slice(1) : raw;
  const [integerPart, decimalPart] = magnitude.split('.');
  const formattedInteger = integerPart === '' ? '0' : Number(integerPart).toLocaleString('en-US');
  const formatted = decimalPart === undefined ? formattedInteger : `${formattedInteger}.${decimalPart}`;
  return negative ? `-${formatted}` : formatted;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

export function formatResultForStorage(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  const normalized = Object.is(value, -0) ? 0 : value;
  const rounded = Number(normalized.toPrecision(12));
  return trimTrailingZeros(rounded.toString());
}

/** Evaluates an alternating number/operator token list, binding × and ÷ tighter than + and −. */
export function evaluateTokens(tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  let acc = Number(tokens[0]);
  const terms: number[] = [];
  const additive: CalculatorOperator[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i] as CalculatorOperator;
    const rhs = Number(tokens[i + 1]);
    if (operator === '×') acc *= rhs;
    else if (operator === '÷') acc /= rhs;
    else {
      terms.push(acc);
      additive.push(operator);
      acc = rhs;
    }
  }
  terms.push(acc);
  let result = terms[0] ?? 0;
  for (let i = 0; i < additive.length; i++) {
    const rhs = terms[i + 1] ?? 0;
    result = additive[i] === '+' ? result + rhs : result - rhs;
  }
  return result;
}

export function expressionDisplay(tokens: readonly string[]): string {
  if (tokens.length === 0) return '0';
  return tokens.map((token) => (isOperatorToken(token) ? token : formatNumberToken(token))).join(' ');
}

export function getMainDisplay(state: CalculatorState): string {
  if (state.errorMessage) return state.errorMessage;
  return expressionDisplay(state.tokens);
}

let historyId = 0;
function nextHistoryId(): string {
  historyId += 1;
  return `h${historyId}`;
}

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'digit': {
      if (state.freshResult) {
        return { ...state, tokens: [action.digit], freshResult: false, preview: null, errorMessage: null };
      }
      const tokens = [...state.tokens];
      if (tokens.length === 0) {
        tokens.push(action.digit);
        return { ...state, tokens, preview: null, errorMessage: null };
      }
      const last = lastToken(tokens);
      if (isOperatorToken(last)) {
        tokens.push(action.digit);
        return { ...state, tokens, preview: null, errorMessage: null };
      }
      if (digitCount(last) >= MAX_INTEGER_DIGITS) return state;
      tokens[tokens.length - 1] = last === '0' ? action.digit : last + action.digit;
      return { ...state, tokens, preview: null };
    }
    case 'decimal': {
      if (state.freshResult) {
        return { ...state, tokens: ['0.'], freshResult: false, preview: null, errorMessage: null };
      }
      const tokens = [...state.tokens];
      if (tokens.length === 0) {
        tokens.push('0.');
        return { ...state, tokens, preview: null, errorMessage: null };
      }
      const last = lastToken(tokens);
      if (isOperatorToken(last)) {
        tokens.push('0.');
        return { ...state, tokens, preview: null, errorMessage: null };
      }
      if (last.includes('.')) return state;
      tokens[tokens.length - 1] = `${last}.`;
      return { ...state, tokens, preview: null };
    }
    case 'operator': {
      if (state.tokens.length === 0) return state;
      const tokens = [...state.tokens];
      const last = lastToken(tokens);
      if (isOperatorToken(last)) {
        tokens[tokens.length - 1] = action.operator;
      } else {
        tokens.push(action.operator);
      }
      return { ...state, tokens, freshResult: false, preview: null };
    }
    case 'equals': {
      if (state.tokens.length === 0) return state;
      const last = lastToken(state.tokens);
      const cleaned = isOperatorToken(last) ? state.tokens.slice(0, -1) : state.tokens;
      if (cleaned.length === 0) return state;
      const value = evaluateTokens(cleaned);
      const resultToken = formatResultForStorage(value);
      const isError = resultToken === 'Error';
      const entry: HistoryEntry = {
        id: nextHistoryId(),
        expression: expressionDisplay(cleaned),
        result: isError ? 'Error' : formatNumberToken(resultToken),
      };
      return {
        tokens: isError ? [] : [resultToken],
        freshResult: true,
        preview: isError ? null : `${entry.expression} =`,
        errorMessage: isError ? 'Error' : null,
        history: [entry, ...state.history].slice(0, 50),
      };
    }
    case 'clear':
      return { ...state, tokens: [], freshResult: false, preview: null, errorMessage: null };
    case 'backspace': {
      if (state.freshResult) return { ...state, tokens: [], freshResult: false, errorMessage: null };
      if (state.tokens.length === 0) return state;
      const tokens = [...state.tokens];
      const last = lastToken(tokens);
      if (isOperatorToken(last) || last.replace('-', '').length <= 1) {
        tokens.pop();
      } else {
        tokens[tokens.length - 1] = last.slice(0, -1);
      }
      return { ...state, tokens, preview: null };
    }
    case 'toggle-sign': {
      if (state.tokens.length === 0) return state;
      const tokens = [...state.tokens];
      const last = lastToken(tokens);
      if (isOperatorToken(last)) return state;
      tokens[tokens.length - 1] = last.startsWith('-') ? last.slice(1) : `-${last}`;
      return { ...state, tokens, freshResult: false };
    }
    case 'percent': {
      if (state.tokens.length === 0) return state;
      const tokens = [...state.tokens];
      const last = lastToken(tokens);
      if (isOperatorToken(last)) return state;
      const value = Number(last) / 100;
      tokens[tokens.length - 1] = trimTrailingZeros(value.toString());
      return { ...state, tokens, freshResult: false };
    }
    case 'clear-history':
      return { ...state, history: [] };
    default:
      return state;
  }
}
