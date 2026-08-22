'use client';

import type { MouseEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { pathsEqual, type FocusPath, type Slot, type StructItem } from './expression_tree';

interface SlotViewProps {
  slot: Slot;
  path: FocusPath;
  focusPath: FocusPath;
  cursor: number;
  onFocus?: (path: FocusPath, cursor: number) => void;
}

function Child({
  item,
  index,
  itemPath,
  keyName,
  focusPath,
  cursor,
  onFocus,
}: {
  item: StructItem;
  index: number;
  itemPath: FocusPath;
  keyName: string;
  focusPath: FocusPath;
  cursor: number;
  onFocus?: (path: FocusPath, cursor: number) => void;
}) {
  return (
    <SlotView
      slot={item.children[keyName] ?? []}
      path={[...itemPath, { itemIndex: index, key: keyName }]}
      focusPath={focusPath}
      cursor={cursor}
      onFocus={onFocus}
    />
  );
}

/**
 * Renders the expression tree as real inline math: characters as text, and template items
 * (power, root, fraction, log base, sum, integral) as their own clickable child boxes. Clicking
 * anywhere in a slot moves the caret there (left half of the click target puts it at the start,
 * right half at the end), so a blank base, exponent, numerator or bound is directly fillable,
 * not just typeable in sequence.
 */
export function SlotView({ slot, path, focusPath, cursor, onFocus }: SlotViewProps) {
  const isActive = pathsEqual(path, focusPath);

  function handleClick(event: MouseEvent<HTMLSpanElement>) {
    if (!onFocus) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedLeft = event.clientX - rect.left < rect.width / 2;
    onFocus(path, clickedLeft ? 0 : slot.length);
  }

  return (
    <span onClick={handleClick} className={cn('calc-slot relative inline-flex items-baseline', onFocus && 'cursor-text')}>
      {slot.length === 0 && <span className="calc-empty-slot" aria-hidden />}
      {slot.map((item, index) => {
        const key = `${item.type}-${index}`;
        const childProps = { index, itemPath: path, focusPath, cursor, onFocus };
        return (
          <span key={key} className="inline-flex items-baseline">
            {isActive && cursor === index && <span className="calc-caret" aria-hidden />}
            {item.type === 'char' && <span className="whitespace-pre">{item.value}</span>}
            {item.type === 'power' && (
              <span className="inline-flex items-baseline">
                <Child {...childProps} item={item} keyName="base" />
                <sup className="ml-0.5 text-[0.7em]">
                  <Child {...childProps} item={item} keyName="exponent" />
                </sup>
              </span>
            )}
            {item.type === 'root' && (
              <span className="calc-radical">
                <span className="calc-radical-symbol">√</span>
                <span className="calc-radical-bar">
                  <Child {...childProps} item={item} keyName="radicand" />
                </span>
              </span>
            )}
            {item.type === 'nthroot' && (
              <span className="calc-radical">
                <span className="calc-radical-index">
                  <Child {...childProps} item={item} keyName="index" />
                </span>
                <span className="calc-radical-symbol">√</span>
                <span className="calc-radical-bar">
                  <Child {...childProps} item={item} keyName="radicand" />
                </span>
              </span>
            )}
            {item.type === 'fraction' && (
              <span className="calc-fraction">
                <span className="calc-fraction-num">
                  <Child {...childProps} item={item} keyName="numerator" />
                </span>
                <span className="calc-fraction-denom">
                  <Child {...childProps} item={item} keyName="denominator" />
                </span>
              </span>
            )}
            {item.type === 'logbase' && (
              <span className="inline-flex items-baseline">
                <span>log</span>
                <sub className="text-[0.65em]">
                  <Child {...childProps} item={item} keyName="base" />
                </sub>
                <span>(</span>
                <Child {...childProps} item={item} keyName="argument" />
                <span>)</span>
              </span>
            )}
            {(item.type === 'ncr' || item.type === 'npr') && (
              <span className="inline-flex items-baseline">
                <span>{item.type === 'ncr' ? 'nCr' : 'nPr'}</span>
                <span>(</span>
                <Child {...childProps} item={item} keyName="n" />
                <span>,</span>
                <Child {...childProps} item={item} keyName="r" />
                <span>)</span>
              </span>
            )}
            {(item.type === 'sum' || item.type === 'integral') && (
              <span className="inline-flex items-baseline">
                <span className="calc-bounded-symbol">
                  <sup className="calc-bound-to">
                    <Child {...childProps} item={item} keyName="to" />
                  </sup>
                  <span className="calc-bounded-glyph">{item.type === 'sum' ? 'Σ' : '∫'}</span>
                  <sub className="calc-bound-from">
                    <Child {...childProps} item={item} keyName="from" />
                  </sub>
                </span>
                <span>(</span>
                <Child {...childProps} item={item} keyName="body" />
                <span>)</span>
              </span>
            )}
          </span>
        );
      })}
      {isActive && cursor === slot.length && <span className="calc-caret" aria-hidden />}
    </span>
  );
}
