'use client';

import { cn } from '@/lib/utils/cn';
import { QR_TYPES, type QrTypeId } from './qr_content';
import { TypeGlyph } from './type_visuals';

export function TypePicker({ value, onChange }: { value: QrTypeId; onChange: (id: QrTypeId) => void }) {
  return (
    <div role="radiogroup" aria-label="QR type" className="grid grid-cols-4 gap-1 sm:grid-cols-7 sm:gap-2">
      {QR_TYPES.map((type) => {
        const active = value === type.id;
        return (
          <button
            key={type.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={type.hint}
            onClick={() => onChange(type.id)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] font-medium transition-colors',
              active ? 'bg-brand/10 text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-muted',
            )}
          >
            <TypeGlyph id={type.id} className="size-8" />
            {type.label}
          </button>
        );
      })}
    </div>
  );
}
