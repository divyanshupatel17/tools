'use client';

import { useCallback, useEffect, useReducer } from 'react';
import {
  calculatorReducer,
  getAriaText,
  INITIAL_CALCULATOR_STATE,
  type FocusPath,
  type ItemKind,
} from './calculator_engine';

interface UseCalculatorOptions {
  /** Fired with a key id (matching the on screen keypad) on every action, mouse or keyboard. */
  onActivity?: (keyId: string) => void;
}

export function useCalculator({ onActivity }: UseCalculatorOptions = {}) {
  const [state, dispatch] = useReducer(calculatorReducer, INITIAL_CALCULATOR_STATE);

  const insertText = useCallback(
    (keyId: string, text: string) => {
      onActivity?.(keyId);
      dispatch({ type: 'insert-text', text });
    },
    [onActivity],
  );
  const insertTemplate = useCallback(
    (keyId: string, kind: ItemKind, exponentText?: string, baseText?: string) => {
      onActivity?.(keyId);
      dispatch({ type: 'insert-template', kind, exponentText, baseText });
    },
    [onActivity],
  );
  const insertExpNotation = useCallback(() => {
    onActivity?.('exp');
    dispatch({ type: 'insert-exp-notation' });
  }, [onActivity]);
  const pressEquals = useCallback(() => {
    onActivity?.('equals');
    dispatch({ type: 'equals' });
  }, [onActivity]);
  const pressClearAll = useCallback(() => {
    onActivity?.('clear');
    dispatch({ type: 'clear-all' });
  }, [onActivity]);
  const pressBackspace = useCallback(() => {
    onActivity?.('backspace');
    dispatch({ type: 'backspace' });
  }, [onActivity]);
  const pressToggleSign = useCallback(() => {
    onActivity?.('sign');
    dispatch({ type: 'toggle-sign' });
  }, [onActivity]);
  const moveCursor = useCallback(
    (direction: -1 | 1) => {
      onActivity?.(direction === -1 ? 'left' : 'right');
      dispatch({ type: 'move-cursor', direction });
    },
    [onActivity],
  );
  const focusSlot = useCallback((path: FocusPath, cursor: number) => {
    dispatch({ type: 'focus-slot', path, cursor });
  }, []);
  const toggleAngleMode = useCallback(() => {
    onActivity?.('angle-mode');
    dispatch({ type: 'toggle-angle-mode' });
  }, [onActivity]);
  const undo = useCallback(() => {
    onActivity?.('undo');
    dispatch({ type: 'undo' });
  }, [onActivity]);
  const redo = useCallback(() => {
    onActivity?.('redo');
    dispatch({ type: 'redo' });
  }, [onActivity]);
  const clearHistory = useCallback(() => dispatch({ type: 'clear-history' }), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (event.key >= '0' && event.key <= '9') {
        insertText(`digit-${event.key}`, event.key);
        return;
      }
      if (event.key === '.') {
        insertText('decimal', '.');
        return;
      }
      if (event.key === '+') {
        insertText('op-+', '+');
        return;
      }
      if (event.key === '-') {
        insertText('op--', '-');
        return;
      }
      if (event.key === '*') {
        insertText('op-×', '×');
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        insertText('op-÷', '÷');
        return;
      }
      if (event.key === '^') {
        insertTemplate('pow', 'power');
        return;
      }
      if (event.key === '(' || event.key === ')') {
        insertText(event.key === '(' ? 'lparen' : 'rparen', event.key);
        return;
      }
      if (event.key === '%') {
        insertText('percent', '%');
        return;
      }
      if (event.key === '!') {
        insertText('factorial', '!');
        return;
      }
      if (event.key === 'ArrowLeft') {
        moveCursor(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        moveCursor(1);
        return;
      }
      if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        pressEquals();
        return;
      }
      if (event.key === 'Backspace') {
        pressBackspace();
        return;
      }
      if (event.key === 'Escape') {
        pressClearAll();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [insertText, insertTemplate, moveCursor, pressEquals, pressBackspace, pressClearAll, undo, redo]);

  return {
    root: state.root,
    focus: state.focus,
    cursor: state.cursor,
    preview: state.errorMessage ?? state.preview,
    hasError: Boolean(state.errorMessage),
    ariaText: getAriaText(state),
    angleMode: state.angleMode,
    history: state.history,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    insertText,
    insertTemplate,
    insertExpNotation,
    pressEquals,
    pressClearAll,
    pressBackspace,
    pressToggleSign,
    moveCursor,
    focusSlot,
    toggleAngleMode,
    undo,
    redo,
    clearHistory,
  };
}
