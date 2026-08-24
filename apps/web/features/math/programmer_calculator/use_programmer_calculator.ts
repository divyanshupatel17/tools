'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ProgrammerCalcError,
  evaluateExpression,
  formatUnsigned,
  type BitWidth,
  type NumberSystem,
} from './calculator_engine';

export interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
}

interface EvalState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

interface EditorState {
  expression: string;
  cursor: number;
}

export function useProgrammerCalculator() {
  const [editor, setEditor] = useState<EditorState>({ expression: '', cursor: 0 });
  const [numberSystem, setNumberSystem] = useState<NumberSystem>('DEC');
  const [bitWidth, setBitWidth] = useState<BitWidth>(64);
  const [signed, setSigned] = useState(false);
  const [ans, setAns] = useState<bigint | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [evalState, setEvalState] = useState<EvalState>({ status: 'idle', message: '' });

  const { expression, cursor } = editor;

  const live = useMemo(() => {
    try {
      const value = evaluateExpression(expression, { width: bitWidth, signed, ans, numberSystem });
      return { value, error: null as string | null };
    } catch (error) {
      return { value: null as bigint | null, error: error instanceof Error ? error.message : 'Invalid expression' };
    }
  }, [expression, bitWidth, signed, ans, numberSystem]);

  /** Sets the expression and cursor together, e.g. from the native input's onChange. */
  const setExpression = useCallback((next: string, nextCursor?: number) => {
    setEditor({ expression: next, cursor: nextCursor ?? next.length });
  }, []);

  const setCursor = useCallback((next: number) => {
    setEditor((current) => ({ ...current, cursor: next }));
  }, []);

  /** Inserts at the current cursor, reading and advancing it atomically to stay correct under rapid taps. */
  const insertAtCursor = useCallback((text: string) => {
    setEditor((current) => {
      const pos = current.cursor;
      const nextExpression = current.expression.slice(0, pos) + text + current.expression.slice(pos);
      return { expression: nextExpression, cursor: pos + text.length };
    });
  }, []);

  const clearAll = useCallback(() => {
    setEditor({ expression: '', cursor: 0 });
    setEvalState({ status: 'idle', message: '' });
  }, []);

  const backspace = useCallback(() => {
    setEditor((current) => {
      if (current.cursor <= 0) return current;
      const nextExpression = current.expression.slice(0, current.cursor - 1) + current.expression.slice(current.cursor);
      return { expression: nextExpression, cursor: current.cursor - 1 };
    });
  }, []);

  const moveCursor = useCallback((delta: number) => {
    setEditor((current) => ({
      ...current,
      cursor: Math.max(0, Math.min(current.expression.length, current.cursor + delta)),
    }));
  }, []);

  const evaluate = useCallback(() => {
    try {
      const value = evaluateExpression(expression, { width: bitWidth, signed, ans, numberSystem });
      setAns(value);
      setEvalState({ status: 'success', message: 'Expression evaluated correctly.' });
      setHistory((prev) => [
        { id: `${Date.now()}-${Math.random()}`, expression, result: formatUnsigned(value, numberSystem) },
        ...prev,
      ].slice(0, 50));
      return value;
    } catch (error) {
      const message = error instanceof ProgrammerCalcError || error instanceof Error ? error.message : 'Could not evaluate expression.';
      setEvalState({ status: 'error', message });
      return null;
    }
  }, [expression, bitWidth, signed, ans, numberSystem]);

  const replaceWithValue = useCallback((value: bigint) => {
    setExpression(formatUnsigned(value, numberSystem));
  }, [numberSystem, setExpression]);

  const clearHistory = useCallback(() => setHistory([]), []);

  return {
    expression,
    cursor,
    setExpression,
    setCursor,
    numberSystem,
    setNumberSystem,
    bitWidth,
    setBitWidth,
    signed,
    setSigned,
    ans,
    history,
    clearHistory,
    evalState,
    liveValue: live.value,
    liveError: live.error,
    insertAtCursor,
    clearAll,
    backspace,
    moveCursor,
    evaluate,
    replaceWithValue,
  };
}
