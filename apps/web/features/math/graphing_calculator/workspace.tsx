'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Expand, Home, Minimize2, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCalculatorFullscreen } from '../calculator/use_calculator_fullscreen';
import { ExpressionPanel } from '../shared/expression_panel';
import { GraphCanvas, type GraphCanvasHandle } from './graph_canvas';
import type { RenderRow } from './canvas_renderer';
import { useGraphingCalculator } from './use_graphing_calculator';
import type { Scope } from './parser';

const EXPORT_OPTIONS: { label: string; scale: number }[] = [
  { label: 'Standard (1x)', scale: 1 },
  { label: 'High (2x)', scale: 2 },
  { label: 'Ultra (4x)', scale: 4 },
];

const DEFAULT_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;

function clampPanelWidth(width: number): number {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function GraphingCalculatorWorkspace() {
  const calculator = useGraphingCalculator();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHandleRef = useRef<GraphCanvasHandle>(null);
  const { isFullscreen, toggle } = useCalculatorFullscreen(containerRef);
  const [exportOpen, setExportOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function onDividerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    function onMove(moveEvent: PointerEvent) {
      setPanelWidth(clampPanelWidth(startWidth + (moveEvent.clientX - startX)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onDividerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') setPanelWidth((width) => clampPanelWidth(width - 24));
    else if (event.key === 'ArrowRight') setPanelWidth((width) => clampPanelWidth(width + 24));
  }

  const renderRows: RenderRow[] = useMemo(
    () =>
      calculator.rows.map((rowState) => {
        const result = calculator.model.find((entry) => entry.id === rowState.id);
        return { id: rowState.id, color: rowState.color, hidden: rowState.hidden, row: result?.row ?? { type: 'empty' } };
      }),
    [calculator.rows, calculator.model],
  );

  const params: Scope = useMemo(() => {
    const scope: Record<string, number> = {};
    for (const entry of calculator.model) {
      if (entry.row.type === 'slider') scope[entry.row.paramName] = entry.row.value;
    }
    return scope;
  }, [calculator.model]);

  return (
    <div
      ref={containerRef}
      className={cn('w-full', isFullscreen && 'flex h-full flex-col overflow-hidden bg-background p-4')}
    >
      <div
        className={cn(
          'flex w-full flex-col gap-4 lg:flex-row lg:gap-0',
          isFullscreen ? 'min-h-0 flex-1' : 'lg:items-start',
        )}
      >
        <div
          style={isDesktop ? { width: panelWidth, flex: `0 0 ${panelWidth}px` } : undefined}
          className={cn(
            'order-2 w-full lg:order-1',
            isFullscreen ? 'lg:h-full' : 'lg:sticky lg:top-20 lg:h-[38rem]',
          )}
        >
          <ExpressionPanel calculator={calculator} dndContextId="graphing-calculator-expressions" />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize the expression panel"
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          onKeyDown={onDividerKeyDown}
          className="order-3 mx-1 hidden w-3 shrink-0 cursor-col-resize items-center justify-center rounded-full outline-none select-none hover:bg-surface-muted focus-visible:bg-surface-muted lg:order-2 lg:flex lg:self-stretch"
        >
          <span className="h-10 w-1 rounded-full bg-border" aria-hidden />
        </div>

        <div className={cn('order-1 flex min-w-0 flex-1 flex-col gap-2 lg:order-3', isFullscreen && 'min-h-0 flex-1')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ToolbarButton label="Reset view" onClick={calculator.resetView}>
                <Home className="size-4" aria-hidden />
              </ToolbarButton>
              <ToolbarButton label="Zoom in" onClick={() => calculator.zoomBy(1.4)}>
                <Plus className="size-4" aria-hidden />
              </ToolbarButton>
              <ToolbarButton label="Zoom out" onClick={() => calculator.zoomBy(1 / 1.4)}>
                <Minus className="size-4" aria-hidden />
              </ToolbarButton>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <ToolbarButton label="Export graph as an image" onClick={() => setExportOpen((value) => !value)}>
                  <Download className="size-4" aria-hidden />
                </ToolbarButton>
                {exportOpen && (
                  <div
                    className="absolute top-11 right-0 z-10 flex w-40 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]"
                    onMouseLeave={() => setExportOpen(false)}
                  >
                    {EXPORT_OPTIONS.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          canvasHandleRef.current?.exportPng(option.scale);
                          setExportOpen(false);
                        }}
                        className="px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ToolbarButton label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'} onClick={toggle}>
                {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
              </ToolbarButton>
            </div>
          </div>

          <div className={isFullscreen ? 'min-h-0 flex-1' : 'h-[26rem] lg:h-[38rem]'}>
            <GraphCanvas
              ref={canvasHandleRef}
              rows={renderRows}
              params={params}
              viewport={calculator.viewport}
              onPan={calculator.panBy}
              onZoom={calculator.zoomAt}
              fileName="graph"
            />
          </div>
          <p className="text-center text-xs text-muted">
            Drag to pan, scroll or pinch to zoom, hover a curve to read its exact value. Type
            a=1 to add a slider, or an equation like x^2+y^2=4 to plot a curve.
          </p>
        </div>
      </div>
    </div>
  );
}
