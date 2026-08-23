export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export interface RowState {
  id: string;
  raw: string;
  color: string;
  hidden: boolean;
}

export interface RowResultLike<TRow> {
  id: string;
  raw: string;
  row: TRow;
}

/** A `type: 'slider'` variant every row union passed to `ExpressionPanel` must include. */
export interface SliderRowLike {
  type: 'slider';
  paramName: string;
  value: number;
  declaredDefault: number;
}

/** A `type: 'error'` variant every row union passed to `ExpressionPanel` must include. */
export interface ErrorRowLike {
  type: 'error';
  message: string;
}

/**
 * The shape `ExpressionPanel`/`FunctionKeypad` need from a graphing calculator's state hook.
 * Both the 2D and 3D calculators implement this structurally, so the shared panel works for
 * either without depending on either feature's concrete row union beyond `{ type: string }`.
 */
export interface ExpressionCalculator<TRow extends { type: string }> {
  rows: RowState[];
  model: RowResultLike<TRow>[];
  playing: Readonly<Record<string, boolean>>;
  rangeFor: (id: string, declaredDefault: number) => SliderRange;
  addRow: (afterId?: string) => string;
  loadExamples: () => void;
  clearAll: () => void;
  updateRowText: (id: string, raw: string) => void;
  removeRow: (id: string) => void;
  toggleHidden: (id: string) => void;
  setColor: (id: string, color: string) => void;
  reorderRow: (activeId: string, overId: string) => void;
  setSliderValue: (id: string, value: number) => void;
  setSliderRange: (id: string, range: SliderRange) => void;
  togglePlay: (id: string) => void;
}
