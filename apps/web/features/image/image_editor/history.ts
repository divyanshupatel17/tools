import { useCallback, useState } from 'react';
import type { EditorDocument } from './editor_state';

const MAX_HISTORY = 60;

/**
 * A history entry is the document *and* which layer was selected at the time. Selection is part
 * of the snapshot because undoing a delete that did not restore the selection reads as broken:
 * the layer comes back but its options panel stays closed.
 */
interface Snapshot {
  doc: EditorDocument;
  selected: string | null;
}

interface HistoryState {
  current: Snapshot;
  undo: readonly Snapshot[];
  redo: readonly Snapshot[];
}

function nextSnapshot(
  current: Snapshot,
  doc: EditorDocument,
  selected: string | null | undefined,
): Snapshot {
  return { doc, selected: selected === undefined ? current.selected : selected };
}

/**
 * Undo and redo over whole document snapshots. `commit` pushes the new state onto the undo
 * stack and clears redo; `replace` swaps the current state in place without touching history,
 * for continuous gestures (dragging, freehand strokes) that should collapse to one undo step.
 * Both take an optional selection; leaving it out keeps whatever was selected.
 *
 * The stacks live in state rather than refs so the updater stays pure. Pushing onto a ref from
 * inside a state updater would record the same snapshot twice under Strict Mode.
 */
export function useEditorHistory(initial: EditorDocument) {
  const [state, setState] = useState<HistoryState>({
    current: { doc: initial, selected: null },
    undo: [],
    redo: [],
  });

  const commit = useCallback((doc: EditorDocument, selected?: string | null) => {
    setState((state) => ({
      current: nextSnapshot(state.current, doc, selected),
      undo: [...state.undo, state.current].slice(-MAX_HISTORY),
      redo: [],
    }));
  }, []);

  const replace = useCallback((doc: EditorDocument, selected?: string | null) => {
    setState((state) => ({ ...state, current: nextSnapshot(state.current, doc, selected) }));
  }, []);

  const select = useCallback((selected: string | null) => {
    setState((state) =>
      state.current.selected === selected
        ? state
        : { ...state, current: { ...state.current, selected } },
    );
  }, []);

  const undo = useCallback(() => {
    setState((state) => {
      const previous = state.undo.at(-1);
      if (!previous) return state;
      return {
        current: previous,
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, state.current].slice(-MAX_HISTORY),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((state) => {
      const next = state.redo.at(-1);
      if (!next) return state;
      return {
        current: next,
        undo: [...state.undo, state.current].slice(-MAX_HISTORY),
        redo: state.redo.slice(0, -1),
      };
    });
  }, []);

  const reset = useCallback((doc: EditorDocument) => {
    setState({ current: { doc, selected: null }, undo: [], redo: [] });
  }, []);

  return {
    doc: state.current.doc,
    selectedLayerId: state.current.selected,
    commit,
    replace,
    select,
    undo,
    redo,
    reset,
    canUndo: state.undo.length > 0,
    canRedo: state.redo.length > 0,
  };
}
