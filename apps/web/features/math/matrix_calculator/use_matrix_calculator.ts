'use client';

import { useCallback, useState } from 'react';
import {
  DEFAULT_DIM,
  OPERATIONS,
  compute,
  createMatrix,
  dims,
  formatNumber,
  resizeMatrix,
  type Matrix,
  type MatrixOperation,
  type OperationResult,
} from './matrix_engine';

export interface HistoryEntry {
  id: string;
  label: string;
  summary: string;
}

function operationLabel(operation: MatrixOperation, power: number): string {
  const info = OPERATIONS.find((item) => item.id === operation);
  if (!info) return operation;
  return info.needsPower ? `A^${power}` : info.label;
}

function summarize(result: OperationResult, decimalPlaces: number | undefined): string {
  if (!result.ok) return result.error ?? 'Error';
  if (result.scalar !== undefined) return formatNumber(result.scalar, decimalPlaces);
  if (result.values) return result.values.join(', ');
  if (result.matrix) {
    const { rows, cols } = dims(result.matrix);
    return `${rows}×${cols} matrix`;
  }
  return '';
}

export function useMatrixCalculator() {
  const [matrixA, setMatrixA] = useState<Matrix>(() => createMatrix(DEFAULT_DIM, DEFAULT_DIM, 'zero'));
  const [matrixB, setMatrixB] = useState<Matrix>(() => createMatrix(DEFAULT_DIM, DEFAULT_DIM, 'zero'));
  const [operation, setOperation] = useState<MatrixOperation>('multiply');
  const [power, setPower] = useState(2);
  const [displayDecimals, setDisplayDecimals] = useState(false);
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const setCellA = useCallback((r: number, c: number, value: number) => {
    setMatrixA((prev) => prev.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row)));
  }, []);
  const setCellB = useCallback((r: number, c: number, value: number) => {
    setMatrixB((prev) => prev.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row)));
  }, []);

  const resizeA = useCallback((rows: number, cols: number) => {
    setMatrixA((prev) => resizeMatrix(prev, rows, cols));
  }, []);
  const resizeB = useCallback((rows: number, cols: number) => {
    setMatrixB((prev) => resizeMatrix(prev, rows, cols));
  }, []);

  const fillA = useCallback((fill: 'zero' | 'identity' | 'random') => {
    setMatrixA((prev) => createMatrix(dims(prev).rows, dims(prev).cols, fill));
  }, []);
  const fillB = useCallback((fill: 'zero' | 'identity' | 'random') => {
    setMatrixB((prev) => createMatrix(dims(prev).rows, dims(prev).cols, fill));
  }, []);

  const resetA = useCallback(() => setMatrixA(createMatrix(DEFAULT_DIM, DEFAULT_DIM, 'zero')), []);
  const resetB = useCallback(() => setMatrixB(createMatrix(DEFAULT_DIM, DEFAULT_DIM, 'zero')), []);

  const calculate = useCallback(() => {
    const outcome = compute(operation, matrixA, matrixB, power);
    setResult(outcome);
    setHistory((prev) => [
      {
        id: `${Date.now()}`,
        label: operationLabel(operation, power),
        summary: summarize(outcome, displayDecimals ? decimalPlaces : undefined),
      },
      ...prev,
    ].slice(0, 20));
  }, [operation, matrixA, matrixB, power, displayDecimals, decimalPlaces]);

  const clearAll = useCallback(() => {
    setMatrixA((prev) => createMatrix(dims(prev).rows, dims(prev).cols, 'zero'));
    setMatrixB((prev) => createMatrix(dims(prev).rows, dims(prev).cols, 'zero'));
    setResult(null);
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return {
    matrixA,
    matrixB,
    operation,
    power,
    displayDecimals,
    decimalPlaces,
    result,
    history,
    setCellA,
    setCellB,
    resizeA,
    resizeB,
    fillA,
    fillB,
    resetA,
    resetB,
    setOperation,
    setPower,
    setDisplayDecimals,
    setDecimalPlaces,
    calculate,
    clearAll,
    clearHistory,
  };
}
