/**
 * A small rich expression tree: mostly flat runs of typed characters, plus "template" items
 * that hold their own named, nested slots (a power's base/exponent, a root's radicand, a
 * fraction's numerator/denominator, and so on). This is what lets x^y, roots, fractions, sums
 * and integrals render as real 2D math with independently clickable, fillable boxes, instead of
 * a plain text string the user has to type parentheses and commas into correctly.
 */

export type ItemKind = 'power' | 'root' | 'nthroot' | 'fraction' | 'logbase' | 'sum' | 'integral' | 'ncr' | 'npr';

/** Ordered child slot keys for each template kind, used for rendering order and navigation. */
export const CHILD_ORDER: Record<ItemKind, readonly string[]> = {
  power: ['base', 'exponent'],
  root: ['radicand'],
  nthroot: ['index', 'radicand'],
  fraction: ['numerator', 'denominator'],
  logbase: ['base', 'argument'],
  sum: ['from', 'to', 'body'],
  integral: ['from', 'to', 'body'],
  ncr: ['n', 'r'],
  npr: ['n', 'r'],
};

export interface PathStep {
  itemIndex: number;
  key: string;
}

export type FocusPath = PathStep[];

export interface CharItem {
  type: 'char';
  value: string;
}

export interface StructItem {
  type: ItemKind;
  children: Record<string, Slot>;
}

export type SlotItem = CharItem | StructItem;
export type Slot = SlotItem[];

export function charsOf(text: string): CharItem[] {
  return [...text].map((value) => ({ type: 'char', value }));
}

export function isEmptySlot(slot: Slot): boolean {
  return slot.length === 0;
}

export function pathsEqual(a: FocusPath, b: FocusPath): boolean {
  if (a.length !== b.length) return false;
  return a.every((step, i) => step.itemIndex === b[i]?.itemIndex && step.key === b[i]?.key);
}

export function getSlotAt(root: Slot, path: FocusPath): Slot {
  let slot = root;
  for (const step of path) {
    const item = slot[step.itemIndex];
    if (!item || item.type === 'char') return [];
    slot = item.children[step.key] ?? [];
  }
  return slot;
}

export function updateSlotAt(root: Slot, path: FocusPath, updater: (slot: Slot) => Slot): Slot {
  if (path.length === 0) return updater(root);
  const [step, ...rest] = path as [PathStep, ...FocusPath];
  return root.map((item, i) => {
    if (i !== step.itemIndex || item.type === 'char') return item;
    return {
      ...item,
      children: { ...item.children, [step.key]: updateSlotAt(item.children[step.key] ?? [], rest, updater) },
    };
  });
}

export function insertText(
  root: Slot,
  focus: FocusPath,
  cursor: number,
  text: string,
): { root: Slot; cursor: number } {
  const items = charsOf(text);
  const newRoot = updateSlotAt(root, focus, (slot) => [...slot.slice(0, cursor), ...items, ...slot.slice(cursor)]);
  return { root: newRoot, cursor: cursor + items.length };
}

function isDigitChar(item: SlotItem | undefined): boolean {
  return !!item && item.type === 'char' && /[0-9.]/.test(item.value);
}

function isLetterChar(item: SlotItem | undefined): boolean {
  return !!item && item.type === 'char' && /[A-Za-z]/.test(item.value);
}

/** Grabs the term immediately before the cursor so x^y can wrap it as the base automatically. */
export function consumeTrailingAtom(slot: Slot, cursor: number): { consumed: Slot; start: number } {
  if (cursor > 0) {
    const before = slot[cursor - 1];
    if (before?.type === 'char' && before.value === ')') {
      let depth = 0;
      let j = cursor;
      while (j > 0) {
        const item = slot[j - 1];
        if (item?.type === 'char' && item.value === ')') depth += 1;
        if (item?.type === 'char' && item.value === '(') depth -= 1;
        j -= 1;
        if (depth === 0) break;
      }
      let start = j;
      while (start > 0 && isLetterChar(slot[start - 1])) start -= 1;
      return { consumed: slot.slice(start, cursor), start };
    }
    if (before && before.type !== 'char') {
      return { consumed: slot.slice(cursor - 1, cursor), start: cursor - 1 };
    }
    if (isDigitChar(before)) {
      let start = cursor;
      while (start > 0 && isDigitChar(slot[start - 1])) start -= 1;
      if (start > 0) {
        const beforeRun = slot[start - 1];
        if (beforeRun?.type === 'char' && beforeRun.value === '-') start -= 1;
      }
      return { consumed: slot.slice(start, cursor), start };
    }
  }
  return { consumed: [], start: cursor };
}

/**
 * Inserts a template item at the cursor. `power` wraps whatever term sits immediately before
 * the cursor as its base (or leaves it empty); every other kind always starts fully empty, since
 * there is nothing sensible to auto-consume for a root, fraction, log base, sum or integral.
 */
export function insertTemplate(
  root: Slot,
  focus: FocusPath,
  cursor: number,
  kind: ItemKind,
  options: { exponentText?: string; baseText?: string } = {},
): { root: Slot; focus: FocusPath; cursor: number } {
  const slot = getSlotAt(root, focus);
  const keys = CHILD_ORDER[kind];

  if (kind === 'power') {
    if (options.baseText) {
      const item: StructItem = { type: 'power', children: { base: charsOf(options.baseText), exponent: [] } };
      const newSlot = [...slot.slice(0, cursor), item, ...slot.slice(cursor)];
      const newRoot = updateSlotAt(root, focus, () => newSlot);
      return { root: newRoot, focus: [...focus, { itemIndex: cursor, key: 'exponent' }], cursor: 0 };
    }
    const { consumed, start } = consumeTrailingAtom(slot, cursor);
    const item: StructItem = {
      type: 'power',
      children: { base: consumed, exponent: options.exponentText ? charsOf(options.exponentText) : [] },
    };
    const newSlot = [...slot.slice(0, start), item, ...slot.slice(cursor)];
    const newRoot = updateSlotAt(root, focus, () => newSlot);
    if (options.exponentText) return { root: newRoot, focus, cursor: start + 1 };
    const key = consumed.length > 0 ? 'exponent' : 'base';
    return { root: newRoot, focus: [...focus, { itemIndex: start, key }], cursor: 0 };
  }

  const children: Record<string, Slot> = {};
  for (const key of keys) children[key] = [];
  const item: StructItem = { type: kind, children };
  const newSlot = [...slot.slice(0, cursor), item, ...slot.slice(cursor)];
  const newRoot = updateSlotAt(root, focus, () => newSlot);
  return { root: newRoot, focus: [...focus, { itemIndex: cursor, key: keys[0] as string }], cursor: 0 };
}

/** Function name openers removed as one unit on backspace, instead of one character at a time. */
const TEXT_FUNCTION_OPENERS = [
  'sin⁻¹(',
  'cos⁻¹(',
  'tan⁻¹(',
  'sinh⁻¹(',
  'cosh⁻¹(',
  'tanh⁻¹(',
  'eˣ(',
  'asin(',
  'acos(',
  'atan(',
  'asinh(',
  'acosh(',
  'atanh(',
  'sinh(',
  'cosh(',
  'tanh(',
  'round(',
  'log(',
  'ln(',
  'exp(',
  'abs(',
  'csc(',
  'sec(',
  'cot(',
  'sin(',
  'cos(',
  'tan(',
];
const WORD_OPENERS = [' mod ', ' nCr ', ' nPr '];

function trailingText(slot: Slot, cursor: number, maxLength: number): string {
  let text = '';
  for (let i = cursor - 1; i >= 0 && text.length < maxLength; i--) {
    const item = slot[i];
    if (item?.type !== 'char') break;
    text = item.value + text;
  }
  return text;
}

export function backspaceAt(
  root: Slot,
  focus: FocusPath,
  cursor: number,
): { root: Slot; focus: FocusPath; cursor: number } {
  const slot = getSlotAt(root, focus);
  if (cursor > 0) {
    const trailing = trailingText(slot, cursor, 6);
    const opener = [...TEXT_FUNCTION_OPENERS, ...WORD_OPENERS].find((token) => trailing.endsWith(token));
    const removeCount = opener ? [...opener].length : 1;
    const newSlot = [...slot.slice(0, cursor - removeCount), ...slot.slice(cursor)];
    return { root: updateSlotAt(root, focus, () => newSlot), focus, cursor: cursor - removeCount };
  }
  if (focus.length === 0) return { root, focus, cursor };

  const parentPath = focus.slice(0, -1);
  const step = focus[focus.length - 1] as PathStep;
  const parentSlot = getSlotAt(root, parentPath);
  const item = parentSlot[step.itemIndex];
  if (!item || item.type === 'char') return { root, focus, cursor };

  const keys = CHILD_ORDER[item.type];
  const allEmpty = keys.every((key) => isEmptySlot(item.children[key] ?? []));
  if (allEmpty) {
    const newParentSlot = [...parentSlot.slice(0, step.itemIndex), ...parentSlot.slice(step.itemIndex + 1)];
    return { root: updateSlotAt(root, parentPath, () => newParentSlot), focus: parentPath, cursor: step.itemIndex };
  }

  const currentIndex = keys.indexOf(step.key);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const key = keys[i] as string;
    const target = item.children[key] ?? [];
    if (!isEmptySlot(target)) {
      return { root, focus: [...parentPath, { itemIndex: step.itemIndex, key }], cursor: target.length };
    }
  }
  return { root, focus: parentPath, cursor: step.itemIndex };
}

/** The struct item that owns the slot at `focus` (i.e. the item one level up from it), if any. */
function parentItemOf(root: Slot, focus: FocusPath): { item: StructItem; parentPath: FocusPath; step: PathStep } | null {
  if (focus.length === 0) return null;
  const parentPath = focus.slice(0, -1);
  const step = focus[focus.length - 1] as PathStep;
  const parentSlot = getSlotAt(root, parentPath);
  const item = parentSlot[step.itemIndex];
  if (!item || item.type === 'char') return null;
  return { item, parentPath, step };
}

export function moveCursorAt(
  root: Slot,
  focus: FocusPath,
  cursor: number,
  direction: -1 | 1,
): { focus: FocusPath; cursor: number } {
  const slot = getSlotAt(root, focus);
  if (direction === 1) {
    if (cursor < slot.length) {
      const item = slot[cursor] as SlotItem;
      if (item.type !== 'char') {
        const firstKey = CHILD_ORDER[item.type][0] as string;
        return { focus: [...focus, { itemIndex: cursor, key: firstKey }], cursor: 0 };
      }
      return { focus, cursor: cursor + 1 };
    }
    const parent = parentItemOf(root, focus);
    if (parent) {
      const keys = CHILD_ORDER[parent.item.type];
      const currentIndex = keys.indexOf(parent.step.key);
      const nextKey = keys[currentIndex + 1];
      if (nextKey) {
        return { focus: [...parent.parentPath, { itemIndex: parent.step.itemIndex, key: nextKey }], cursor: 0 };
      }
      return { focus: parent.parentPath, cursor: parent.step.itemIndex + 1 };
    }
    return { focus, cursor };
  }
  if (cursor > 0) {
    const item = slot[cursor - 1] as SlotItem;
    if (item.type !== 'char') {
      const keys = CHILD_ORDER[item.type];
      const lastKey = keys[keys.length - 1] as string;
      const target = item.children[lastKey] ?? [];
      return { focus: [...focus, { itemIndex: cursor - 1, key: lastKey }], cursor: target.length };
    }
    return { focus, cursor: cursor - 1 };
  }
  const parent = parentItemOf(root, focus);
  if (parent) {
    const keys = CHILD_ORDER[parent.item.type];
    const currentIndex = keys.indexOf(parent.step.key);
    const prevKey = keys[currentIndex - 1];
    if (prevKey) {
      const target = parent.item.children[prevKey] ?? [];
      return { focus: [...parent.parentPath, { itemIndex: parent.step.itemIndex, key: prevKey }], cursor: target.length };
    }
    return { focus: parent.parentPath, cursor: parent.step.itemIndex };
  }
  return { focus, cursor };
}

/** Serializes the tree back to the plain grammar the parser already understands. */
export function linearize(slot: Slot): string {
  return slot
    .map((item) => {
      if (item.type === 'char') return item.value;
      const at = (key: string, fallback: string) => linearize(item.children[key] ?? []) || fallback;
      switch (item.type) {
        case 'power':
          return `(${at('base', '0')})^(${at('exponent', '0')})`;
        case 'root':
          return `sqrt(${at('radicand', '0')})`;
        case 'nthroot':
          return `nthroot(${at('index', '2')},${at('radicand', '0')})`;
        case 'fraction':
          return `(${at('numerator', '0')})÷(${at('denominator', '1')})`;
        case 'logbase':
          return `logbase(${at('base', '10')},${at('argument', '0')})`;
        case 'sum':
          return `sum(${at('from', '0')},${at('to', '0')},${at('body', '0')})`;
        case 'integral':
          return `integral(${at('from', '0')},${at('to', '0')},${at('body', '0')})`;
        case 'ncr':
          return `ncr(${at('n', '0')},${at('r', '0')})`;
        case 'npr':
          return `npr(${at('n', '0')},${at('r', '0')})`;
        default:
          return '';
      }
    })
    .join('');
}
