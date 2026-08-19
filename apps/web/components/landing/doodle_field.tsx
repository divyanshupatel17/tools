'use client';

import { useEffect } from 'react';
import { Doodle } from '@/components/ui/doodle';
import {
  startDoodleField,
  useDoodleMarks,
  type DoodleRegion,
  type DoodleScale,
} from '@/lib/landing/doodle_store';

export function DoodleField({
  scale = 'normal',
  region = 'gutters',
}: {
  scale?: DoodleScale;
  region?: DoodleRegion;
}) {
  const marks = useDoodleMarks();

  useEffect(() => startDoodleField({ scale, region }), [scale, region]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {marks.map((mark) => (
        <Doodle
          key={mark.id}
          name={mark.name}
          className={`doodle-fade absolute h-auto ${mark.slot} ${mark.size} ${mark.tilt} ${
            mark.flip ? '-scale-x-100' : ''
          } ${mark.visible ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  );
}
