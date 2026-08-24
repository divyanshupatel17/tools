export type NumberSystem = 'BIN' | 'OCT' | 'DEC' | 'HEX';
export type BitWidth = 8 | 16 | 32 | 64;

export const BIT_WIDTHS: BitWidth[] = [8, 16, 32, 64];
export const NUMBER_SYSTEMS: NumberSystem[] = ['BIN', 'OCT', 'DEC', 'HEX'];

const RADIX: Record<NumberSystem, number> = { BIN: 2, OCT: 8, DEC: 10, HEX: 16 };

export function maskForWidth(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n;
}

/** Wraps any bigint (positive or negative) into its unsigned representation for the given width. */
export function wrapToWidth(value: bigint, width: BitWidth): bigint {
  return value & maskForWidth(width);
}

/** Reads an unsigned width representation as its two's complement signed value. */
export function toSigned(value: bigint, width: BitWidth): bigint {
  const half = 1n << BigInt(width - 1);
  return value >= half ? value - (1n << BigInt(width)) : value;
}

export function digitsForWidth(width: BitWidth, base: NumberSystem): number {
  const bitsPerDigit = base === 'BIN' ? 1 : base === 'OCT' ? 3 : base === 'HEX' ? 4 : 0;
  if (bitsPerDigit === 0) return 0;
  return Math.ceil(width / bitsPerDigit);
}

export function isDigitValidForSystem(digit: string, system: NumberSystem): boolean {
  const value = parseInt(digit, 16);
  if (Number.isNaN(value)) return false;
  return value < RADIX[system];
}

export function formatUnsigned(value: bigint, base: NumberSystem): string {
  const text = value.toString(RADIX[base]);
  return base === 'HEX' ? text.toUpperCase() : text;
}

/** Formats an unsigned width representation for display, honouring signed mode for decimal only. */
export function formatValue(value: bigint, base: NumberSystem, width: BitWidth, signed: boolean): string {
  if (base === 'DEC' && signed) {
    return toSigned(value, width).toString(10);
  }
  return formatUnsigned(value, base);
}

/** Groups a base-N digit string into nibble-ish clusters, padded to the full width, for readable display. */
export function groupAndPad(value: bigint, base: 'BIN' | 'OCT' | 'HEX', width: BitWidth): string {
  const digitCount = digitsForWidth(width, base);
  const raw = formatUnsigned(value, base).padStart(digitCount, '0');
  const groupSize = base === 'OCT' ? 3 : 4;
  const groups: string[] = [];
  for (let end = raw.length; end > 0; end -= groupSize) {
    groups.unshift(raw.slice(Math.max(0, end - groupSize), end));
  }
  return groups.join(' ');
}

export class ProgrammerCalcError extends Error {}

type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen';
interface Token {
  type: TokenType;
  text: string;
  value?: bigint;
}

const IDENT_OPS = new Set(['AND', 'OR', 'XOR', 'NOT', 'NAND', 'NOR', 'XNOR', 'ROL', 'ROR', 'MOD', 'ANS']);

/** Parses an explicitly prefixed literal (0x/0b/0o), independent of the active number system. */
function parsePrefixedLiteral(text: string): bigint {
  return BigInt(text.toLowerCase());
}

/** Parses a bare (unprefixed) digit string in the given base, without precision loss for large widths. */
function parseInBase(text: string, base: NumberSystem): bigint {
  const radix = BigInt(RADIX[base]);
  let value = 0n;
  for (const ch of text) {
    value = value * radix + BigInt(parseInt(ch, 16));
  }
  return value;
}

function tokenize(expression: string, defaultBase: NumberSystem): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = expression;
  while (i < src.length) {
    const ch = src[i] ?? '';
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', text: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', text: ')' });
      i += 1;
      continue;
    }
    if ('+-*/%&|^~'.includes(ch)) {
      tokens.push({ type: 'op', text: ch });
      i += 1;
      continue;
    }
    if (ch === '<' && src[i + 1] === '<') {
      tokens.push({ type: 'op', text: '<<' });
      i += 2;
      continue;
    }
    if (ch === '>' && src[i + 1] === '>') {
      tokens.push({ type: 'op', text: '>>' });
      i += 2;
      continue;
    }
    const isPrefixStart = ch === '0' && /[xXbBoO]/.test(src[i + 1] ?? '');
    if (isPrefixStart || isDigitValidForSystem(ch, defaultBase)) {
      let j = i;
      let value: bigint;
      if (isPrefixStart) {
        j = i + 2;
        while (j < src.length && /[0-9a-fA-F]/.test(src[j] ?? '')) j += 1;
        const text = src.slice(i, j);
        try {
          value = parsePrefixedLiteral(text);
        } catch {
          throw new ProgrammerCalcError(`Invalid number "${text}"`);
        }
      } else {
        while (j < src.length && isDigitValidForSystem(src[j] ?? '', defaultBase)) j += 1;
        value = parseInBase(src.slice(i, j), defaultBase);
      }
      tokens.push({ type: 'number', text: src.slice(i, j), value });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z]/.test(src[j] ?? '')) j += 1;
      const text = src.slice(i, j).toUpperCase();
      if (!IDENT_OPS.has(text)) {
        throw new ProgrammerCalcError(`Unknown token "${src.slice(i, j)}"`);
      }
      tokens.push({ type: 'ident', text });
      i = j;
      continue;
    }
    throw new ProgrammerCalcError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

export interface EvalOptions {
  width: BitWidth;
  signed: boolean;
  ans: bigint | null;
  numberSystem: NumberSystem;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private opts: EvalOptions,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private atIdent(name: string): boolean {
    const t = this.peek();
    return !!t && t.type === 'ident' && t.text === name;
  }
  private atOp(text: string): boolean {
    const t = this.peek();
    return !!t && t.type === 'op' && t.text === text;
  }
  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ProgrammerCalcError('Unexpected end of expression');
    this.pos += 1;
    return t;
  }

  private wrap(v: bigint): bigint {
    return wrapToWidth(v, this.opts.width);
  }

  parse(): bigint {
    const result = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new ProgrammerCalcError(`Unexpected token "${this.tokens[this.pos]?.text}"`);
    }
    return result;
  }

  private parseOr(): bigint {
    let left = this.parseXor();
    for (;;) {
      if (this.atOp('|') || this.atIdent('OR')) {
        this.consume();
        left = this.wrap(left | this.parseXor());
      } else if (this.atIdent('NOR')) {
        this.consume();
        left = this.wrap(~(left | this.parseXor()));
      } else break;
    }
    return left;
  }

  private parseXor(): bigint {
    let left = this.parseAnd();
    for (;;) {
      if (this.atOp('^') || this.atIdent('XOR')) {
        this.consume();
        left = this.wrap(left ^ this.parseAnd());
      } else if (this.atIdent('XNOR')) {
        this.consume();
        left = this.wrap(~(left ^ this.parseAnd()));
      } else break;
    }
    return left;
  }

  private parseAnd(): bigint {
    let left = this.parseShift();
    for (;;) {
      if (this.atOp('&') || this.atIdent('AND')) {
        this.consume();
        left = this.wrap(left & this.parseShift());
      } else if (this.atIdent('NAND')) {
        this.consume();
        left = this.wrap(~(left & this.parseShift()));
      } else break;
    }
    return left;
  }

  private rotateLeft(v: bigint, n: bigint): bigint {
    const w = BigInt(this.opts.width);
    const shift = ((n % w) + w) % w;
    if (shift === 0n) return v;
    return this.wrap((v << shift) | (v >> (w - shift)));
  }
  private rotateRight(v: bigint, n: bigint): bigint {
    const w = BigInt(this.opts.width);
    const shift = ((n % w) + w) % w;
    if (shift === 0n) return v;
    return this.wrap((v >> shift) | (v << (w - shift)));
  }

  private parseShift(): bigint {
    let left = this.parseAdditive();
    for (;;) {
      if (this.atOp('<<')) {
        this.consume();
        left = this.wrap(left << this.parseAdditive());
      } else if (this.atOp('>>')) {
        this.consume();
        const n = this.parseAdditive();
        left = this.opts.signed
          ? this.wrap(toSigned(left, this.opts.width) >> n)
          : this.wrap(left >> n);
      } else if (this.atIdent('ROL')) {
        this.consume();
        left = this.rotateLeft(left, this.parseAdditive());
      } else if (this.atIdent('ROR')) {
        this.consume();
        left = this.rotateRight(left, this.parseAdditive());
      } else break;
    }
    return left;
  }

  private parseAdditive(): bigint {
    let left = this.parseMultiplicative();
    for (;;) {
      if (this.atOp('+')) {
        this.consume();
        left = this.wrap(left + this.parseMultiplicative());
      } else if (this.atOp('-')) {
        this.consume();
        left = this.wrap(left - this.parseMultiplicative());
      } else break;
    }
    return left;
  }

  private parseMultiplicative(): bigint {
    let left = this.parseUnary();
    for (;;) {
      if (this.atOp('*')) {
        this.consume();
        left = this.wrap(left * this.parseUnary());
      } else if (this.atOp('/')) {
        this.consume();
        const right = this.parseUnary();
        left = this.divide(left, right);
      } else if (this.atOp('%') || this.atIdent('MOD')) {
        this.consume();
        const right = this.parseUnary();
        left = this.remainder(left, right);
      } else break;
    }
    return left;
  }

  private divide(a: bigint, b: bigint): bigint {
    if (this.opts.signed) {
      const sa = toSigned(a, this.opts.width);
      const sb = toSigned(b, this.opts.width);
      if (sb === 0n) throw new ProgrammerCalcError('Division by zero');
      return this.wrap(sa / sb);
    }
    if (b === 0n) throw new ProgrammerCalcError('Division by zero');
    return this.wrap(a / b);
  }
  private remainder(a: bigint, b: bigint): bigint {
    if (this.opts.signed) {
      const sa = toSigned(a, this.opts.width);
      const sb = toSigned(b, this.opts.width);
      if (sb === 0n) throw new ProgrammerCalcError('Division by zero');
      return this.wrap(sa % sb);
    }
    if (b === 0n) throw new ProgrammerCalcError('Division by zero');
    return this.wrap(a % b);
  }

  private parseUnary(): bigint {
    if (this.atOp('-')) {
      this.consume();
      return this.wrap(-this.parseUnary());
    }
    if (this.atOp('+')) {
      this.consume();
      return this.parseUnary();
    }
    if (this.atOp('~') || this.atIdent('NOT')) {
      this.consume();
      return this.wrap(~this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): bigint {
    const t = this.peek();
    if (!t) throw new ProgrammerCalcError('Unexpected end of expression');
    if (t.type === 'number') {
      this.consume();
      return this.wrap(t.value!);
    }
    if (t.type === 'ident' && t.text === 'ANS') {
      this.consume();
      if (this.opts.ans === null) throw new ProgrammerCalcError('No previous answer');
      return this.wrap(this.opts.ans);
    }
    if (t.type === 'lparen') {
      this.consume();
      const value = this.parseOr();
      if (!this.atRparen()) throw new ProgrammerCalcError('Missing closing parenthesis');
      this.consume();
      return value;
    }
    throw new ProgrammerCalcError(`Unexpected token "${t.text}"`);
  }

  private atRparen(): boolean {
    const t = this.peek();
    return !!t && t.type === 'rparen';
  }
}

/** Evaluates a programmer calculator expression, returning the unsigned width representation of the result. */
export function evaluateExpression(expression: string, opts: EvalOptions): bigint {
  const trimmed = expression.trim();
  if (trimmed.length === 0) throw new ProgrammerCalcError('Empty expression');
  const tokens = tokenize(trimmed, opts.numberSystem);
  if (tokens.length === 0) throw new ProgrammerCalcError('Empty expression');
  return new Parser(tokens, opts).parse();
}
