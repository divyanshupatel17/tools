/**
 * A small expression compiler for the graphing calculator. Tokenizes, parses to an AST with a
 * real recursive descent grammar (precedence: `+ -` < `* / mod` < unary < `^` < postfix `! %`),
 * then compiles the AST to a closure so plotting can call `evaluate(scope)` thousands of times
 * per redraw without re-parsing. Domain errors (sqrt of a negative, log of zero, ...) resolve to
 * NaN rather than throwing, so a curve can skip an undefined point instead of failing entirely.
 */

export type Ast =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '+' | '-'; arg: Ast }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: Ast; right: Ast }
  | { kind: 'call'; name: string; args: Ast[] }
  | { kind: 'postfix'; op: '!' | '%'; arg: Ast };

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'bang' | 'percent';

interface Token {
  type: TokenType;
  value: string;
}

/** Reserved words the tokenizer resolves to a single token, longest/most specific name first. */
const FUNCTION_NAMES = [
  'arcsinh',
  'arccosh',
  'arctanh',
  'arcsin',
  'arccos',
  'arctan',
  'arccsc',
  'arcsec',
  'arccot',
  'asinh',
  'acosh',
  'atanh',
  'asin',
  'acos',
  'atan',
  'acsc',
  'asec',
  'acot',
  'sinh',
  'cosh',
  'tanh',
  'csch',
  'sech',
  'coth',
  'sin',
  'cos',
  'tan',
  'csc',
  'sec',
  'cot',
  'sqrt',
  'cbrt',
  'nthroot',
  'exp',
  'abs',
  'floor',
  'ceil',
  'round',
  'sign',
  'ln',
  'log',
  'gcd',
  'lcm',
  'mod',
  'ncr',
  'npr',
  'min',
  'max',
  'mean',
  'sum',
] as const;

const CONSTANT_NAMES = ['pi', 'tau', 'phi', 'infinity', 'e'] as const;
export const RESERVED_NAMES: ReadonlySet<string> = new Set<string>([...FUNCTION_NAMES, ...CONSTANT_NAMES]);

const CONSTANTS: Record<(typeof CONSTANT_NAMES)[number], number> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  infinity: Infinity,
  e: Math.E,
};

const NUMBER_RE = /^(\d+\.?\d*|\.\d+)/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source.replace(/\s+/g, '');
  while (rest.length > 0) {
    const numberMatch = NUMBER_RE.exec(rest);
    if (numberMatch) {
      tokens.push({ type: 'num', value: numberMatch[0] });
      rest = rest.slice(numberMatch[0].length);
      continue;
    }
    const wordMatch = /^[A-Za-z][A-Za-z0-9]*/.exec(rest);
    if (wordMatch) {
      let word = wordMatch[0];
      rest = rest.slice(word.length);
      while (word.length > 0) {
        const known = [...FUNCTION_NAMES, ...CONSTANT_NAMES].find((name) => word.toLowerCase().startsWith(name));
        if (known) {
          tokens.push({ type: 'ident', value: known });
          word = word.slice(known.length);
          continue;
        }
        // An unrecognised word is split into single letter variables multiplied together
        // ("ab" -> a * b), matching how a bare juxtaposition is read everywhere else.
        const letter = word[0] as string;
        tokens.push({ type: 'ident', value: letter });
        if (word.length > 1) tokens.push({ type: 'op', value: '*' });
        word = word.slice(1);
      }
      continue;
    }
    const ch = rest[0] as string;
    if (ch === 'π') tokens.push({ type: 'ident', value: 'pi' });
    else if (ch === 'τ') tokens.push({ type: 'ident', value: 'tau' });
    else if (ch === 'φ') tokens.push({ type: 'ident', value: 'phi' });
    else if (ch === '∞') tokens.push({ type: 'ident', value: 'infinity' });
    else if (ch === '(') tokens.push({ type: 'lparen', value: ch });
    else if (ch === ')') tokens.push({ type: 'rparen', value: ch });
    else if (ch === ',') tokens.push({ type: 'comma', value: ch });
    else if (ch === '!') tokens.push({ type: 'bang', value: ch });
    else if (ch === '%') tokens.push({ type: 'percent', value: ch });
    else if ('+-*/×÷^'.includes(ch)) {
      const normalized = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
      tokens.push({ type: 'op', value: normalized });
    } else {
      throw new Error(`Unexpected character "${ch}"`);
    }
    rest = rest.slice(1);
  }
  return insertImplicitMultiplication(tokens);
}

function endsAtom(token: Token): boolean {
  return token.type === 'num' || token.type === 'rparen' || token.type === 'bang' || token.type === 'percent' ||
    (token.type === 'ident' && !(FUNCTION_NAMES as readonly string[]).includes(token.value));
}

function startsAtom(token: Token): boolean {
  return token.type === 'ident' || token.type === 'lparen' || token.type === 'num';
}

/** A number, `)`, variable or constant directly followed by another atom or `(` implies `*`. */
function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    out.push(token);
    const nextToken = tokens[i + 1];
    if (nextToken && endsAtom(token) && startsAtom(nextToken) && !(token.type === 'num' && nextToken.type === 'num')) {
      out.push({ type: 'op', value: '*' });
    }
  }
  return out;
}

const VARIADIC_ARITY: Record<string, { min: number; max: number }> = {
  log: { min: 1, max: 2 },
  nthroot: { min: 2, max: 2 },
  mod: { min: 2, max: 2 },
  ncr: { min: 2, max: 2 },
  npr: { min: 2, max: 2 },
  gcd: { min: 2, max: Infinity },
  lcm: { min: 2, max: Infinity },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
  mean: { min: 1, max: Infinity },
  sum: { min: 1, max: Infinity },
};

const UNARY_NAMES: ReadonlySet<string> = new Set(FUNCTION_NAMES.filter((name) => !(name in VARIADIC_ARITY)));

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new Error('Unexpected end of expression');
    this.position += 1;
    return token;
  }

  private expect(type: TokenType, what: string): Token {
    const token = this.next();
    if (token.type !== type) throw new Error(`Expected ${what}`);
    return token;
  }

  parse(): Ast {
    const value = this.parseExpr();
    if (this.position !== this.tokens.length) throw new Error('Unexpected trailing input');
    return value;
  }

  private parseExpr(): Ast {
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
        this.next();
        value = { kind: 'binary', op: token.value, left: value, right: this.parseTerm() };
      } else {
        return value;
      }
    }
  }

  private parseTerm(): Ast {
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && (token.value === '*' || token.value === '/')) {
        this.next();
        value = { kind: 'binary', op: token.value, left: value, right: this.parseUnary() };
      } else if (token?.type === 'ident' && token.value === 'mod') {
        this.next();
        value = { kind: 'binary', op: '%', left: value, right: this.parseUnary() };
      } else {
        return value;
      }
    }
  }

  private parseUnary(): Ast {
    const token = this.peek();
    if (token?.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.next();
      return { kind: 'unary', op: token.value, arg: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Ast {
    const base = this.parsePostfix();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.next();
      return { kind: 'binary', op: '^', left: base, right: this.parseUnary() };
    }
    return base;
  }

  private parsePostfix(): Ast {
    let value = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'bang') {
        this.next();
        value = { kind: 'postfix', op: '!', arg: value };
      } else if (token?.type === 'percent') {
        this.next();
        value = { kind: 'postfix', op: '%', arg: value };
      } else {
        return value;
      }
    }
  }

  private parsePrimary(): Ast {
    const token = this.next();
    if (token.type === 'num') return { kind: 'num', value: Number(token.value) };
    if (token.type === 'lparen') {
      const value = this.parseExpr();
      this.expect('rparen', 'a closing parenthesis');
      return value;
    }
    if (token.type === 'ident') {
      if ((CONSTANT_NAMES as readonly string[]).includes(token.value)) return { kind: 'num', value: CONSTANTS[token.value as keyof typeof CONSTANTS] };
      if ((FUNCTION_NAMES as readonly string[]).includes(token.value)) {
        this.expect('lparen', `an opening parenthesis after "${token.value}"`);
        const args: Ast[] = [this.parseExpr()];
        while (this.peek()?.type === 'comma') {
          this.next();
          args.push(this.parseExpr());
        }
        this.expect('rparen', 'a closing parenthesis');
        const arity = VARIADIC_ARITY[token.value];
        if (arity && (args.length < arity.min || args.length > arity.max)) {
          throw new Error(`"${token.value}" takes the wrong number of arguments`);
        }
        if (!arity && args.length !== 1) throw new Error(`"${token.value}" takes exactly one argument`);
        return { kind: 'call', name: token.value, args };
      }
      return { kind: 'var', name: token.value };
    }
    throw new Error('Unexpected token');
  }
}

function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 170) return NaN;
  if (!Number.isInteger(n)) {
    // Lanczos approximation of the gamma function so factorial(!) still plots between integers.
    return gamma(n + 1);
  }
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const zz = z - 1;
  let x = LANCZOS_COEFFICIENTS[0] as number;
  for (let i = 1; i < LANCZOS_G + 2; i++) x += (LANCZOS_COEFFICIENTS[i] as number) / (zz + i);
  const t = zz + LANCZOS_G + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (zz + 0.5) * Math.exp(-t) * x;
}

function nCr(n: number, r: number): number {
  if (r < 0 || n < 0 || r > n) return NaN;
  return Math.round(factorial(n) / (factorial(r) * factorial(n - r)));
}

function nPr(n: number, r: number): number {
  if (r < 0 || n < 0 || r > n) return NaN;
  return Math.round(factorial(n) / factorial(n - r));
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

const UNARY_FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  csc: (x) => 1 / Math.sin(x),
  sec: (x) => 1 / Math.cos(x),
  cot: (x) => 1 / Math.tan(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  acsc: (x) => Math.asin(1 / x),
  asec: (x) => Math.acos(1 / x),
  acot: (x) => Math.atan(1 / x),
  arccsc: (x) => Math.asin(1 / x),
  arcsec: (x) => Math.acos(1 / x),
  arccot: (x) => Math.atan(1 / x),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  csch: (x) => 1 / Math.sinh(x),
  sech: (x) => 1 / Math.cosh(x),
  coth: (x) => 1 / Math.tanh(x),
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  arcsinh: Math.asinh,
  arccosh: Math.acosh,
  arctanh: Math.atanh,
  ln: Math.log,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  exp: Math.exp,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const VARIADIC_FUNCTIONS: Record<string, (args: number[]) => number> = {
  log: (args) => (args.length === 1 ? Math.log10(args[0] as number) : Math.log(args[1] as number) / Math.log(args[0] as number)),
  nthroot: (args) => Math.sign(args[1] as number) * Math.abs(args[1] as number) ** (1 / (args[0] as number)),
  mod: (args) => ((args[0] as number) % (args[1] as number) + (args[1] as number)) % (args[1] as number),
  ncr: (args) => nCr(args[0] as number, args[1] as number),
  npr: (args) => nPr(args[0] as number, args[1] as number),
  gcd: (args) => args.reduce((a, b) => gcd(a, b)),
  lcm: (args) => args.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b))),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
  mean: (args) => args.reduce((a, b) => a + b, 0) / args.length,
  sum: (args) => args.reduce((a, b) => a + b, 0),
};

export type Scope = Readonly<Record<string, number>>;
export type CompiledExpression = (scope: Scope) => number;

function compileAst(node: Ast): CompiledExpression {
  switch (node.kind) {
    case 'num': {
      const { value } = node;
      return () => value;
    }
    case 'var': {
      const { name } = node;
      return (scope) => (name in scope ? (scope[name] as number) : NaN);
    }
    case 'unary': {
      const arg = compileAst(node.arg);
      return node.op === '-' ? (scope) => -arg(scope) : arg;
    }
    case 'postfix': {
      const arg = compileAst(node.arg);
      return node.op === '!' ? (scope) => factorial(arg(scope)) : (scope) => arg(scope) / 100;
    }
    case 'binary': {
      const left = compileAst(node.left);
      const right = compileAst(node.right);
      switch (node.op) {
        case '+':
          return (scope) => left(scope) + right(scope);
        case '-':
          return (scope) => left(scope) - right(scope);
        case '*':
          return (scope) => left(scope) * right(scope);
        case '/':
          return (scope) => left(scope) / right(scope);
        case '%':
          return (scope) => ((left(scope) % right(scope)) + right(scope)) % right(scope);
        case '^':
          return (scope) => left(scope) ** right(scope);
      }
      break;
    }
    case 'call': {
      const args = node.args.map(compileAst);
      if (UNARY_NAMES.has(node.name)) {
        const fn = UNARY_FUNCTIONS[node.name] as (x: number) => number;
        const arg = args[0] as CompiledExpression;
        return (scope) => fn(arg(scope));
      }
      const fn = VARIADIC_FUNCTIONS[node.name] as (args: number[]) => number;
      return (scope) => fn(args.map((arg) => arg(scope)));
    }
  }
  throw new Error('Unreachable AST node');
}

/** Collects every free variable name referenced anywhere in the AST (not a function or constant). */
function collectVariables(node: Ast, into: Set<string>): void {
  switch (node.kind) {
    case 'var':
      into.add(node.name);
      return;
    case 'unary':
    case 'postfix':
      collectVariables(node.arg, into);
      return;
    case 'binary':
      collectVariables(node.left, into);
      collectVariables(node.right, into);
      return;
    case 'call':
      for (const arg of node.args) collectVariables(arg, into);
      return;
    case 'num':
      return;
  }
}

export interface CompiledFormula {
  evaluate: CompiledExpression;
  variables: ReadonlySet<string>;
}

/** Parses and compiles a plain math expression (no `=`). Throws a short message on bad syntax. */
export function compileFormula(source: string): CompiledFormula {
  const trimmed = source.trim();
  if (trimmed === '') throw new Error('Empty expression');
  const ast = new Parser(tokenize(trimmed)).parse();
  const variables = new Set<string>();
  collectVariables(ast, variables);
  return { evaluate: compileAst(ast), variables };
}
