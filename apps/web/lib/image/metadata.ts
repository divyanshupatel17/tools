import { guessFormat, IMAGE_MIME } from './image_formats';
import { readImageSize } from './decode';

export interface ImageMetadata {
  dimensions?: { width: number; height: number };
  mime_type: string;
  file_size: number;
  /** Grouped for display: [{ group: 'Camera', entries: [{ label, value }] }, ...] */
  groups: readonly { group: string; entries: readonly { label: string; value: string }[] }[];
  gps?: { latitude: number; longitude: number };
  orientation?: number;
  dpi?: number;
  has_metadata: boolean;
}

const CAMERA_KEYS = ['Make', 'Model', 'Software'] as const;
const EXPOSURE_KEYS = [
  'DateTimeOriginal',
  'ExposureTime',
  'FNumber',
  'ISO',
  'FocalLength',
  'LensModel',
] as const;

const LABELS: Record<string, string> = {
  Make: 'Camera maker',
  Model: 'Camera model',
  Software: 'Software',
  LensModel: 'Lens',
  ExposureTime: 'Exposure time',
  FNumber: 'Aperture',
  ISO: 'ISO',
  FocalLength: 'Focal length',
  DateTimeOriginal: 'Date taken',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'ExposureTime' && typeof value === 'number') {
    return value >= 1 ? `${value} s` : `1/${Math.round(1 / value)} s`;
  }
  if (key === 'FNumber' && typeof value === 'number') return `f/${value}`;
  if (key === 'FocalLength' && typeof value === 'number') return `${value} mm`;
  if (key === 'ISO' && typeof value === 'number') return `ISO ${value}`;
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function buildGroup(
  group: string,
  source: Record<string, unknown> | undefined,
  keys: readonly string[],
): { group: string; entries: { label: string; value: string }[] } | null {
  if (!source) return null;
  const entries = keys
    .filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
    .map((key) => ({ label: LABELS[key] ?? key, value: formatValue(key, source[key]) }));
  return entries.length > 0 ? { group, entries } : null;
}

export async function readMetadata(file: File): Promise<ImageMetadata> {
  const dimensions = await readImageSize(file).catch(() => undefined);

  let ifd0: Record<string, unknown> | undefined;
  let exif: Record<string, unknown> | undefined;
  let gps: { latitude: number; longitude: number } | undefined;

  try {
    const exifr = await import('exifr');
    const [tags, gpsResult] = await Promise.all([
      exifr
        .parse(file, { tiff: true, exif: true, gps: true, mergeOutput: false, sanitize: true })
        .catch(() => null),
      exifr.gps(file).catch(() => undefined),
    ]);
    ifd0 = (tags?.ifd0 as Record<string, unknown> | undefined) ?? undefined;
    exif = (tags?.exif as Record<string, unknown> | undefined) ?? undefined;
    gps = gpsResult;
  } catch {
    ifd0 = undefined;
    exif = undefined;
    gps = undefined;
  }

  const groups = [
    buildGroup('Camera', ifd0, CAMERA_KEYS),
    buildGroup('Exposure', exif, EXPOSURE_KEYS),
  ].filter(
    (group): group is { group: string; entries: { label: string; value: string }[] } =>
      group !== null,
  );

  if (gps) {
    groups.push({
      group: 'Location',
      entries: [
        { label: 'Latitude', value: gps.latitude.toFixed(6) },
        { label: 'Longitude', value: gps.longitude.toFixed(6) },
      ],
    });
  }

  const orientation =
    typeof ifd0?.Orientation === 'number' ? (ifd0.Orientation as number) : undefined;

  let dpi: number | undefined;
  const resolution = ifd0?.XResolution;
  if (typeof resolution === 'number') {
    // ResolutionUnit 3 means centimetres; anything else (including missing) we treat as inches.
    dpi = ifd0?.ResolutionUnit === 3 ? Math.round(resolution * 2.54) : Math.round(resolution);
  }

  const mimeType =
    file.type || (guessFormat(file) ? IMAGE_MIME[guessFormat(file)!] : 'application/octet-stream');

  return {
    dimensions,
    mime_type: mimeType,
    file_size: file.size,
    groups,
    gps,
    orientation,
    dpi,
    has_metadata:
      groups.length > 0 || gps !== undefined || orientation !== undefined || dpi !== undefined,
  };
}
