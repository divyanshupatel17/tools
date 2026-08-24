import {
  backspaceAt,
  charsOf,
  consumeTrailingAtom,
  getSlotAt,
  insertTemplate,
  insertText as treeInsertText,
  linearize,
  moveCursorAt,
  updateSlotAt,
  type FocusPath,
  type ItemKind,
  type Slot,
} from './expression_tree';

export type { FocusPath, ItemKind, Slot } from './expression_tree';

export type AngleMode = 'DEG' | 'RAD';

export interface HistoryEntry {
  id: string;
  expression: Slot;
  result: string;
}

interface Snapshot {
  root: Slot;
  focus: FocusPath;
  cursor: number;
}

export interface CalculatorState {
  root: Slot;
  focus: FocusPath;
  cursor: number;
  preview: string | null;
  errorMessage: string | null;
  angleMode: AngleMode;
  history: HistoryEntry[];
  ans: number;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
}

export type CalculatorAction =
  | { type: 'insert-text'; text: string }
  | { type: 'insert-template'; kind: ItemKind; exponentText?: string; baseText?: string }
  | { type: 'insert-exp-notation' }
  | { type: 'equals' }
  | { type: 'clear-all' }
  | { type: 'backspace' }
  | { type: 'move-cursor'; direction: -1 | 1 }
  | { type: 'toggle-sign' }
  | { type: 'toggle-angle-mode' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear-history' }
  | { type: 'focus-slot'; path: FocusPath; cursor: number };

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  root: [],
  focus: [],
  cursor: 0,
  preview: null,
  errorMessage: null,
  angleMode: 'DEG',
  history: [],
  ans: 0,
  undoStack: [],
  redoStack: [],
};

/** Functions taking one argument: fn(x). Longest/most specific names first, e.g. "asinh" before "asin". */
const UNARY_FUNCTION_TOKENS = [
  'asinh',
  'acosh',
  'atanh',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'round',
  'csc',
  'sec',
  'cot',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'sqrt',
  'exp',
  'abs',
  'floor',
  'ceil',
] as const;
type UnaryFunctionName = (typeof UNARY_FUNCTION_TOKENS)[number];

/**
 * Functions taking two comma separated arguments: fn(a, b). "ncr"/"npr" are also reachable as
 * the infix word operators "n ncr r" / "n npr r" for typed (non template) input.
 */
const BINARY_FUNCTION_TOKENS = ['nthroot', 'logbase', 'ncr', 'npr'] as const;
type BinaryFunctionName = (typeof BINARY_FUNCTION_TOKENS)[number];

/** Numeric only sum/integral: fn(from, to, body), body re-evaluated per step with a bound variable. */
const TERNARY_FUNCTION_TOKENS = ['sum', 'integral'] as const;
type TernaryFunctionName = (typeof TERNARY_FUNCTION_TOKENS)[number];
const TERNARY_VARIABLE: Record<TernaryFunctionName, string> = { sum: 'n', integral: 'x' };

/** Word shaped tokens that are not function calls: infix operators and single letter constants. */
const WORD_OPERATORS = ['mod', 'Ans', 'e', 'rand'] as const;

/**
 * Longest/most specific names first: "logbase" must be tried before "log" or the tokenizer
 * would greedily match the shorter, unrelated function name and leave "base(...)" dangling.
 */
const KNOWN_WORDS = [...BINARY_FUNCTION_TOKENS, ...TERNARY_FUNCTION_TOKENS, ...UNARY_FUNCTION_TOKENS, ...WORD_OPERATORS];

/** Pretty glyphs typed by the keypad that alias a canonical ascii function name for parsing. */
const PRETTY_ALIASES: readonly [glyph: string, canonical: UnaryFunctionName][] = [
  ['sin⁻¹', 'asin'],
  ['cos⁻¹', 'acos'],
  ['tan⁻¹', 'atan'],
  ['sinh⁻¹', 'asinh'],
  ['cosh⁻¹', 'acosh'],
  ['tanh⁻¹', 'atanh'],
  ['eˣ', 'exp'],
];

/** Insert tokens the keypad appends at the cursor as plain characters. */
export const INSERT: Record<string, string> = {
  sin: 'sin(',
  cos: 'cos(',
  tan: 'tan(',
  'sin-1': 'sin⁻¹(',
  'cos-1': 'cos⁻¹(',
  'tan-1': 'tan⁻¹(',
  sinh: 'sinh(',
  cosh: 'cosh(',
  tanh: 'tanh(',
  'sinh-1': 'sinh⁻¹(',
  'cosh-1': 'cosh⁻¹(',
  'tanh-1': 'tanh⁻¹(',
  csc: 'csc(',
  sec: 'sec(',
  cot: 'cot(',
  log: 'log(',
  ln: 'ln(',
  expfn: 'eˣ(',
  round: 'round(',
  abs: 'abs(',
  floor: 'floor(',
  ceil: 'ceil(',
  degree: '°',
  mod: ' mod ',
  ncr: ' nCr ',
  npr: ' nPr ',
  pi: 'π',
  e: 'e',
  phi: 'φ',
  infinity: '∞',
  rand: 'rand',
  ans: 'Ans',
  varN: 'n',
  varX: 'x',
  factorial: '!',
  percent: '%',
  comma: ',',
  lparen: '(',
  rparen: ')',
};

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'bang' | 'percent' | 'degree' | 'comma';

interface Token {
  type: TokenType;
  value: string;
}

const NUMBER_RE = /^(\d+\.?\d*|\.\d+)/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source.replace(/\s+/g, ' ').trim();
  while (rest.length > 0) {
    if (rest[0] === ' ') {
      rest = rest.slice(1);
      continue;
    }
    const alias = PRETTY_ALIASES.find(([glyph]) => rest.startsWith(glyph));
    if (alias) {
      tokens.push({ type: 'ident', value: alias[1] });
      rest = rest.slice(alias[0].length);
      continue;
    }
    const numberMatch = NUMBER_RE.exec(rest);
    if (numberMatch) {
      tokens.push({ type: 'num', value: numberMatch[0] });
      rest = rest.slice(numberMatch[0].length);
      continue;
    }
    const wordMatch = /^[A-Za-z]+[0-9]*/.exec(rest);
    if (wordMatch) {
      const word = wordMatch[0];
      const known = KNOWN_WORDS.find((candidate) => word.toLowerCase().startsWith(candidate.toLowerCase()));
      if (known) {
        tokens.push({ type: 'ident', value: known });
        rest = rest.slice(known.length);
        continue;
      }
      if (word.length === 1) {
        tokens.push({ type: 'ident', value: word });
        rest = rest.slice(1);
        continue;
      }
      throw new Error(`Unknown token "${word}"`);
    }
    const ch = rest[0] as string;
    if (ch === 'π') {
      tokens.push({ type: 'ident', value: 'pi' });
    } else if (ch === 'φ') {
      tokens.push({ type: 'ident', value: 'phi' });
    } else if (ch === '∞') {
      tokens.push({ type: 'ident', value: 'infinity' });
    } else if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
    } else if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
    } else if (ch === '!') {
      tokens.push({ type: 'bang', value: ch });
    } else if (ch === '%') {
      tokens.push({ type: 'percent', value: ch });
    } else if (ch === '°') {
      tokens.push({ type: 'degree', value: ch });
    } else if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
    } else if ('+-×÷^'.includes(ch as string)) {
      tokens.push({ type: 'op', value: ch });
    } else {
      throw new Error(`Unexpected character "${ch}"`);
    }
    rest = rest.slice(1);
  }
  return tokens;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Invalid factorial');
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function nCr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) {
    throw new Error('Invalid nCr');
  }
  return Math.round(factorial(n) / (factorial(r) * factorial(n - r)));
}

function nPr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) {
    throw new Error('Invalid nPr');
  }
  return Math.round(factorial(n) / factorial(n - r));
}

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const MAX_SUM_TERMS = 20000;
const INTEGRAL_STEPS = 1000;

const FUNCTIONS: Record<UnaryFunctionName, (x: number, angleMode: AngleMode) => number> = {
  sin: (x, mode) => Math.sin(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  cos: (x, mode) => Math.cos(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  tan: (x, mode) => Math.tan(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  csc: (x, mode) => 1 / Math.sin(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  sec: (x, mode) => 1 / Math.cos(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  cot: (x, mode) => 1 / Math.tan(mode === 'DEG' ? (x * Math.PI) / 180 : x),
  asin: (x, mode) => (mode === 'DEG' ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (x, mode) => (mode === 'DEG' ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (x, mode) => (mode === 'DEG' ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  sinh: (x) => Math.sinh(x),
  cosh: (x) => Math.cosh(x),
  tanh: (x) => Math.tanh(x),
  asinh: (x) => Math.asinh(x),
  acosh: (x) => Math.acosh(x),
  atanh: (x) => Math.atanh(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  sqrt: (x) => Math.sqrt(x),
  exp: (x) => Math.exp(x),
  abs: (x) => Math.abs(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
};

/** nth root and change-of-base log, both x^(1/n) style two argument calls. */
const FUNCTIONS2: Record<BinaryFunctionName, (a: number, b: number) => number> = {
  nthroot: (n, x) => x ** (1 / n),
  logbase: (base, x) => Math.log(x) / Math.log(base),
  ncr: (n, r) => nCr(n, r),
  npr: (n, r) => nPr(n, r),
};

class Parser {
  private position = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly angleMode: AngleMode,
    private readonly ans: number,
    private readonly variables: Readonly<Record<string, number>> = {},
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new Error('Unexpected end of expression');
    this.position += 1;
    return token;
  }

  parse(): number {
    const value = this.parseExpr();
    if (this.position !== this.tokens.length) throw new Error('Unexpected trailing input');
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
        this.next();
        const rhs = this.parseTerm();
        value = token.value === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && (token.value === '×' || token.value === '÷')) {
        this.next();
        const rhs = this.parseUnary();
        value = token.value === '×' ? value * rhs : value / rhs;
      } else if (token?.type === 'ident' && token.value === 'mod') {
        this.next();
        value = value % this.parseUnary();
      } else if (token?.type === 'ident' && token.value === 'ncr') {
        this.next();
        value = nCr(value, this.parseUnary());
      } else if (token?.type === 'ident' && token.value === 'npr') {
        this.next();
        value = nPr(value, this.parseUnary());
      } else {
        return value;
      }
    }
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.type === 'op' && token.value === '-') {
      this.next();
      return -this.parseUnary();
    }
    if (token?.type === 'op' && token.value === '+') {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePostfix();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.next();
      const exponent = this.parseUnary();
      return base ** exponent;
    }
    return base;
  }

  private parsePostfix(): number {
    let value = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'bang') {
        this.next();
        value = factorial(value);
      } else if (token?.type === 'percent') {
        this.next();
        value = value / 100;
      } else if (token?.type === 'degree') {
        this.next();
        value = (value * Math.PI) / 180;
      } else {
        return value;
      }
    }
  }

  private parsePrimary(): number {
    const token = this.next();
    if (token.type === 'num') return Number(token.value);
    if (token.type === 'lparen') {
      const value = this.parseExpr();
      const closing = this.next();
      if (closing.type !== 'rparen') throw new Error('Missing closing parenthesis');
      return value;
    }
    if (token.type === 'ident') {
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'phi') return GOLDEN_RATIO;
      if (token.value === 'e') return Math.E;
      if (token.value === 'infinity') return Infinity;
      if (token.value === 'rand') return Math.random();
      if (token.value === 'Ans') return this.ans;
      if (token.value === 'sum' || token.value === 'integral') {
        return this.parseSumOrIntegral(token.value as TernaryFunctionName);
      }
      const unaryFn = FUNCTIONS[token.value as UnaryFunctionName];
      if (unaryFn) {
        const open = this.next();
        if (open.type !== 'lparen') throw new Error(`Expected "(" after ${token.value}`);
        const arg = this.parseExpr();
        const close = this.next();
        if (close.type !== 'rparen') throw new Error('Missing closing parenthesis');
        return unaryFn(arg, this.angleMode);
      }
      const binaryFn = FUNCTIONS2[token.value as BinaryFunctionName];
      if (binaryFn) {
        const open = this.next();
        if (open.type !== 'lparen') throw new Error(`Expected "(" after ${token.value}`);
        const first = this.parseExpr();
        const comma = this.next();
        if (comma.type !== 'comma') throw new Error(`Expected "," in ${token.value}`);
        const second = this.parseExpr();
        const close = this.next();
        if (close.type !== 'rparen') throw new Error('Missing closing parenthesis');
        return binaryFn(first, second);
      }
      if (token.value.length === 1) {
        const value = this.variables[token.value];
        if (value !== undefined) return value;
        throw new Error(`Unknown variable "${token.value}"`);
      }
    }
    throw new Error('Unexpected token');
  }

  /** Numeric only sum/integral: captures the body's raw tokens and re-parses them per step. */
  private parseSumOrIntegral(kind: TernaryFunctionName): number {
    const varName = TERNARY_VARIABLE[kind];
    const open = this.next();
    if (open.type !== 'lparen') throw new Error(`Expected "(" after ${kind}`);
    const from = this.parseExpr();
    const c1 = this.next();
    if (c1.type !== 'comma') throw new Error(`Expected "," in ${kind}`);
    const to = this.parseExpr();
    const c2 = this.next();
    if (c2.type !== 'comma') throw new Error(`Expected "," in ${kind}`);

    const bodyTokens: Token[] = [];
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (!t) throw new Error('Missing closing parenthesis');
      if (t.type === 'lparen') depth += 1;
      if (t.type === 'rparen') {
        if (depth === 0) break;
        depth -= 1;
      }
      bodyTokens.push(t);
      this.next();
    }
    const close = this.next();
    if (close.type !== 'rparen') throw new Error('Missing closing parenthesis');

    const evalBodyAt = (value: number): number =>
      new Parser(bodyTokens, this.angleMode, this.ans, { ...this.variables, [varName]: value }).parse();

    if (kind === 'integral') {
      const a = from;
      const b = to;
      const h = (b - a) / INTEGRAL_STEPS;
      let total = evalBodyAt(a) + evalBodyAt(b);
      for (let i = 1; i < INTEGRAL_STEPS; i++) {
        total += (i % 2 === 0 ? 2 : 4) * evalBodyAt(a + i * h);
      }
      return (total * h) / 3;
    }

    const start = Math.round(from);
    const end = Math.round(to);
    if (Math.abs(end - start) > MAX_SUM_TERMS) throw new Error('Sum range too large');
    const step = end >= start ? 1 : -1;
    let total = 0;
    for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
      total += evalBodyAt(n);
    }
    return total;
  }
}

/** Balances unmatched opening parentheses so a live preview can evaluate a still-typing expression. */
function autoClose(expression: string): string {
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
  }
  return depth > 0 ? expression + ')'.repeat(depth) : expression;
}

export function evaluateExpression(expression: string, angleMode: AngleMode, ans: number): number {
  const trimmed = expression.trim();
  if (trimmed === '') throw new Error('Empty expression');
  const tokens = tokenize(autoClose(trimmed));
  const value = new Parser(tokens, angleMode, ans).parse();
  if (Number.isNaN(value)) throw new Error('Math error');
  return value;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

export function formatResult(value: number): string {
  if (Number.isNaN(value)) return 'Error';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const normalized = Object.is(value, -0) ? 0 : value;
  const rounded = Number(normalized.toPrecision(12));
  return trimTrailingZeros(rounded.toString());
}

const DISPLAY_NAMES: Partial<Record<string, string>> = {
  asin: 'sin⁻¹',
  acos: 'cos⁻¹',
  atan: 'tan⁻¹',
  asinh: 'sinh⁻¹',
  acosh: 'cosh⁻¹',
  atanh: 'tanh⁻¹',
  exp: 'eˣ',
  pi: 'π',
  phi: 'φ',
};
const SPACED_WORDS = new Set(['mod']);

/**
 * Renders a linearized expression as a plain text, pretty printed summary (used only for
 * screen reader text; the interactive display renders the tree directly with real superscripts
 * and radicals). Falls back to the raw text if it cannot be tokenized.
 */
export function formatExpressionForDisplay(expression: string): string {
  let tokens: Token[];
  try {
    tokens = tokenize(expression);
  } catch {
    return expression;
  }

  let out = '';
  let depth = 0;
  const absDepths: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.type === 'ident' && token.value === 'abs' && tokens[i + 1]?.type === 'lparen') {
      out += '|';
      depth += 1;
      absDepths.push(depth);
      i += 1;
      continue;
    }
    if (token.type === 'lparen') {
      depth += 1;
      out += '(';
      continue;
    }
    if (token.type === 'rparen') {
      if (absDepths[absDepths.length - 1] === depth) {
        absDepths.pop();
        out += '|';
      } else {
        out += ')';
      }
      depth -= 1;
      continue;
    }
    if (token.type === 'ident') {
      if (SPACED_WORDS.has(token.value)) {
        out += ` ${token.value} `;
      } else {
        out += DISPLAY_NAMES[token.value] ?? token.value;
      }
      continue;
    }
    if (token.type === 'comma') {
      out += ', ';
      continue;
    }
    out += token.value;
  }
  return out.trim();
}

/** Best-effort live preview: null while the expression cannot yet be evaluated. */
export function previewExpression(state: CalculatorState): string | null {
  try {
    const value = evaluateExpression(linearize(state.root), state.angleMode, state.ans);
    return formatResult(value);
  } catch {
    return null;
  }
}

/** Plain text summary of the whole expression, for aria labels. */
export function getAriaText(state: CalculatorState): string {
  const text = linearize(state.root);
  return text === '' ? '0' : formatExpressionForDisplay(text);
}

let historyId = 0;
function nextHistoryId(): string {
  historyId += 1;
  return `sh${historyId}`;
}

function snapshot(state: CalculatorState): Snapshot {
  return { root: state.root, focus: state.focus, cursor: state.cursor };
}

function withUndo(state: CalculatorState): Snapshot[] {
  return [...state.undoStack, snapshot(state)].slice(-100);
}

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'insert-text': {
      const { root, cursor } = treeInsertText(state.root, state.focus, state.cursor, action.text);
      const next: CalculatorState = {
        ...state,
        root,
        cursor,
        errorMessage: null,
        undoStack: withUndo(state),
        redoStack: [],
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'insert-template': {
      const { root, focus, cursor } = insertTemplate(state.root, state.focus, state.cursor, action.kind, {
        exponentText: action.exponentText,
        baseText: action.baseText,
      });
      const next: CalculatorState = {
        ...state,
        root,
        focus,
        cursor,
        errorMessage: null,
        undoStack: withUndo(state),
        redoStack: [],
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'insert-exp-notation': {
      const typed = treeInsertText(state.root, state.focus, state.cursor, '×10');
      const powered = insertTemplate(typed.root, state.focus, typed.cursor, 'power');
      const next: CalculatorState = {
        ...state,
        root: powered.root,
        focus: powered.focus,
        cursor: powered.cursor,
        errorMessage: null,
        undoStack: withUndo(state),
        redoStack: [],
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'toggle-sign': {
      const slot = getSlotAt(state.root, state.focus);
      const { consumed, start } = consumeTrailingAtom(slot, state.cursor);
      let newSlot: Slot;
      let cursorDelta: number;
      if (consumed.length > 0) {
        const first = consumed[0];
        const hasNegative = first?.type === 'char' && first.value === '-';
        newSlot = hasNegative
          ? [...slot.slice(0, start), ...consumed.slice(1), ...slot.slice(state.cursor)]
          : [...slot.slice(0, start), ...charsOf('-'), ...consumed, ...slot.slice(state.cursor)];
        cursorDelta = hasNegative ? -1 : 1;
      } else {
        const before = slot[state.cursor - 1];
        const hasNegative = before?.type === 'char' && before.value === '-';
        newSlot = hasNegative
          ? [...slot.slice(0, state.cursor - 1), ...slot.slice(state.cursor)]
          : [...slot.slice(0, state.cursor), ...charsOf('-'), ...slot.slice(state.cursor)];
        cursorDelta = hasNegative ? -1 : 1;
      }
      const root = updateSlotAt(state.root, state.focus, () => newSlot);
      const cursor = Math.max(0, state.cursor + cursorDelta);
      const next: CalculatorState = { ...state, root, cursor, undoStack: withUndo(state), redoStack: [] };
      return { ...next, preview: previewExpression(next) };
    }
    case 'backspace': {
      const { root, focus, cursor } = backspaceAt(state.root, state.focus, state.cursor);
      const next: CalculatorState = {
        ...state,
        root,
        focus,
        cursor,
        errorMessage: null,
        undoStack: withUndo(state),
        redoStack: [],
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'move-cursor': {
      const { focus, cursor } = moveCursorAt(state.root, state.focus, state.cursor, action.direction);
      return { ...state, focus, cursor };
    }
    case 'focus-slot':
      return { ...state, focus: action.path, cursor: action.cursor };
    case 'clear-all':
      return {
        ...state,
        root: [],
        focus: [],
        cursor: 0,
        preview: null,
        errorMessage: null,
        undoStack: withUndo(state),
        redoStack: [],
      };
    case 'toggle-angle-mode': {
      const angleMode: AngleMode = state.angleMode === 'DEG' ? 'RAD' : 'DEG';
      const next: CalculatorState = { ...state, angleMode };
      return { ...next, preview: previewExpression(next) };
    }
    case 'equals': {
      const text = linearize(state.root);
      if (text.trim() === '') return state;
      try {
        const value = evaluateExpression(text, state.angleMode, state.ans);
        const resultToken = formatResult(value);
        const entry: HistoryEntry = {
          id: nextHistoryId(),
          expression: state.root,
          result: resultToken,
        };
        return {
          ...state,
          root: [],
          focus: [],
          cursor: 0,
          preview: null,
          errorMessage: null,
          ans: value,
          history: [entry, ...state.history].slice(0, 50),
          undoStack: withUndo(state),
          redoStack: [],
        };
      } catch {
        return { ...state, errorMessage: 'Error' };
      }
    }
    case 'undo': {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) return state;
      const next: CalculatorState = {
        ...state,
        root: previous.root,
        focus: previous.focus,
        cursor: previous.cursor,
        errorMessage: null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot(state)],
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'redo': {
      const target = state.redoStack[state.redoStack.length - 1];
      if (!target) return state;
      const next: CalculatorState = {
        ...state,
        root: target.root,
        focus: target.focus,
        cursor: target.cursor,
        errorMessage: null,
        undoStack: [...state.undoStack, snapshot(state)],
        redoStack: state.redoStack.slice(0, -1),
      };
      return { ...next, preview: previewExpression(next) };
    }
    case 'clear-history':
      return { ...state, history: [] };
    default:
      return state;
  }
}
