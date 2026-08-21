'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Download, ExternalLink, TriangleAlert, X } from 'lucide-react';
import { imageRule } from '@/lib/image/image_formats';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Field, Notice, SliderField } from '@/components/image/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { ContentFields } from './content_fields';
import { buildQrContent, createDefaultFields, type QrFields, type QrTypeId } from './qr_content';
import { decodeLogo } from './qr_logo';
import {
  buildQrSvg,
  contentFitsQr,
  drawQrToCanvas,
  type BodyShape,
  type EccLevel,
  type EyeShape,
  type QrLogoStyle,
  type QrStyle,
} from './qr_render';
import { buildPresetLogo, LOGO_PRESETS } from './logo_presets';
import { checkQrScannable } from './qr_scan_check';
import { BODY_SHAPE_OPTIONS, EYE_SHAPE_OPTIONS, ShapeSwatch } from './shape_swatch';
import { TypePicker } from './type_picker';
import { TypeGlyph } from './type_visuals';

const LOGO_RULE = imageRule({ max_files: 1, max_bytes: 8 * 1024 * 1024 });
const PREVIEW_PX = 240;
const SCAN_CHECK_PX = 600;

// A golden design, deliberately darker than the site's own bright `--brand-yellow` /
// `--brand-golden` tokens: verified against the scan check below, the site's literal brand gold
// is too light on white for a real scanner to binarize reliably, so the default here trades a
// little brightness for a code that actually scans out of the box.
const DEFAULT_FG_START = '#7a4f00';
const DEFAULT_FG_END = '#a8720a';

// Types whose content is data for a scanner to parse, not a link — no point offering to open
// them in a tab.
const NON_LINK_TYPES = new Set<QrTypeId>(['text', 'vcard', 'mecard', 'wifi', 'event']);

const ECC_OPTIONS: { value: EccLevel; label: string; hint: string }[] = [
  { value: 'L', label: 'Low', hint: '~7% recovery' },
  { value: 'M', label: 'Medium', hint: '~15% recovery' },
  { value: 'Q', label: 'Quartile', hint: '~25% recovery' },
  { value: 'H', label: 'High', hint: '~30% recovery' },
];

function Section({ title, children, defaultOpen }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-border border-t pt-4 first:border-t-0 first:pt-0">
      <summary className="marker:content-none flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        {title}
        <ChevronDown aria-hidden className="text-muted size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

export function QrGeneratorWorkspace() {
  const [type, setType] = useState<QrTypeId>('url');
  const [fieldsByType, setFieldsByType] = useState<Partial<{ [K in QrTypeId]: QrFields[K] }>>({});

  const [bodyShape, setBodyShape] = useState<BodyShape>('rounded');
  const [eyeFrameShape, setEyeFrameShape] = useState<EyeShape>('rounded');
  const [eyeBallShape, setEyeBallShape] = useState<EyeShape>('rounded');

  const [fgKind, setFgKind] = useState<'solid' | 'gradient'>('gradient');
  const [fgColor, setFgColor] = useState(DEFAULT_FG_START);
  const [fgColor2, setFgColor2] = useState(DEFAULT_FG_END);
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [angle, setAngle] = useState(135);
  const [customizeEyes, setCustomizeEyes] = useState(false);
  const [eyeFrameColor, setEyeFrameColor] = useState('#1b1a17');
  const [eyeBallColor, setEyeBallColor] = useState('#1b1a17');

  const [bgTransparent, setBgTransparent] = useState(false);
  const [bgColor, setBgColor] = useState('#ffffff');

  const [margin, setMargin] = useState(4);
  const [ecc, setEcc] = useState<EccLevel>('M');
  const [sizePx, setSizePx] = useState(1000);

  const [logo, setLogo] = useState<QrLogoStyle | null>(null);
  const [logoSizePercent, setLogoSizePercent] = useState(20);
  const [logoPadding, setLogoPadding] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scanStatus, setScanStatus] = useState<'ok' | 'warn' | null>(null);

  function getFields<T extends QrTypeId>(id: T): QrFields[T] {
    return (fieldsByType[id] as QrFields[T] | undefined) ?? createDefaultFields(id);
  }

  const fields = getFields(type);
  const build = useMemo(() => buildQrContent(type, fields), [type, fields]);
  const tooLong = build.error === null && !contentFitsQr(build.content);

  const style: QrStyle = useMemo(
    () => ({
      bodyShape,
      eyeFrameShape,
      eyeBallShape,
      foreground:
        fgKind === 'solid'
          ? { kind: 'solid', color: fgColor, color2: fgColor, gradientType, angle }
          : { kind: 'gradient', color: fgColor, color2: fgColor2, gradientType, angle },
      eyeFrameColor: customizeEyes ? eyeFrameColor : null,
      eyeBallColor: customizeEyes ? eyeBallColor : null,
      backgroundTransparent: bgTransparent,
      backgroundColor: bgColor,
      margin,
      errorCorrectionLevel: ecc,
      logo: logo
        ? { ...logo, sizePercent: logoSizePercent, padding: logoPadding, paddingColor: bgTransparent ? '#ffffff' : bgColor }
        : null,
    }),
    [
      bodyShape,
      eyeFrameShape,
      eyeBallShape,
      fgKind,
      fgColor,
      fgColor2,
      gradientType,
      angle,
      customizeEyes,
      eyeFrameColor,
      eyeBallColor,
      bgTransparent,
      bgColor,
      margin,
      ecc,
      logo,
      logoSizePercent,
      logoPadding,
    ],
  );

  const canRender = build.error === null && !tooLong;
  const canTestLink =
    canRender &&
    !NON_LINK_TYPES.has(type) &&
    (type !== 'universal' || /^[a-z][a-z0-9+.-]*:/i.test(build.content));

  useEffect(() => {
    if (!previewCanvasRef.current || !canRender) return;
    drawQrToCanvas(previewCanvasRef.current, build.content, style, PREVIEW_PX);
  }, [build.content, style, canRender]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!canRender) {
        setScanStatus(null);
        return;
      }
      // Checked against its own canvas at a resolution well above the small preview, so a
      // low pixel-per-module preview (antialiased circles and rounded corners especially)
      // never reads as a false "hard to scan" warning for a design that actually scans fine
      // at real output size.
      const checkCanvas = document.createElement('canvas');
      drawQrToCanvas(checkCanvas, build.content, style, SCAN_CHECK_PX);
      void checkQrScannable(checkCanvas, build.content).then((ok) => setScanStatus(ok ? 'ok' : 'warn'));
    }, 350);
    return () => clearTimeout(timeout);
  }, [build.content, style, canRender]);

  function patchFields(patch: Partial<QrFields[QrTypeId]>) {
    setFieldsByType((prev) => ({ ...prev, [type]: { ...getFields(type), ...patch } }));
  }

  async function handleLogoFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const decoded = await decodeLogo(file, logoSizePercent, logoPadding, bgColor);
      setLogo(decoded);
      // A logo materially lowers contrast in the middle of the symbol; bump to the highest
      // error correction level so the extra redundancy can cover for it, without locking
      // the control down for anyone who wants to dial it back themselves.
      setEcc('H');
    } catch {
      setLogoError('This image could not be used as a logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoPreset(preset: (typeof LOGO_PRESETS)[number]) {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const built = await buildPresetLogo(preset);
      setLogo({ ...built, sizePercent: logoSizePercent, padding: logoPadding });
      setEcc('H');
    } catch {
      setLogoError('This logo could not be applied.');
    } finally {
      setLogoBusy(false);
    }
  }

  function downloadPng() {
    if (!canRender) return;
    const canvas = document.createElement('canvas');
    drawQrToCanvas(canvas, build.content, style, sizePx);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'qr-code.png');
    }, 'image/png');
  }

  function downloadSvg() {
    if (!canRender) return;
    const svg = buildQrSvg(build.content, style, sizePx);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
  }

  function downloadWebp() {
    if (!canRender) return;
    const canvas = document.createElement('canvas');
    drawQrToCanvas(canvas, build.content, style, sizePx);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'qr-code.webp');
    }, 'image/webp');
  }

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-xl p-3"
        style={{
          backgroundImage: bgTransparent
            ? 'conic-gradient(color-mix(in srgb, var(--foreground) 8%, transparent) 90deg, transparent 90deg 180deg, color-mix(in srgb, var(--foreground) 8%, transparent) 180deg 270deg, transparent 270deg)'
            : undefined,
          backgroundSize: bgTransparent ? '16px 16px' : undefined,
        }}
      >
        {canRender ? (
          <canvas ref={previewCanvasRef} className="rounded-lg" />
        ) : (
          <div
            className="text-muted flex items-center justify-center rounded-lg border border-dashed text-center text-xs"
            style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
          >
            {build.error ?? 'This content is too long to fit in a QR code. Try shortening it.'}
          </div>
        )}
      </div>

      {canRender && scanStatus && (
        <p
          className={`flex items-center gap-1.5 text-center text-xs font-medium ${scanStatus === 'ok' ? 'text-success' : 'text-danger'}`}
        >
          {scanStatus === 'ok' ? (
            <Check aria-hidden className="size-4 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
          )}
          {scanStatus === 'ok'
            ? 'Verified scannable'
            : 'This design may be hard to scan. Try a smaller logo, more contrast, or a higher error correction level.'}
        </p>
      )}
    </div>
  );

  const panel = (
    <ControlPanel>
      <Section title="Choose QR type" defaultOpen>
        <TypePicker value={type} onChange={setType} />
      </Section>

      <Section title="Content" defaultOpen>
        <ContentFields type={type} fields={fields} onChange={patchFields} />
        {build.error && <Notice>{build.error}</Notice>}
        {canTestLink && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(build.content, '_blank', 'noopener,noreferrer')}
            className="self-start"
          >
            <ExternalLink aria-hidden className="size-4" />
            Test link
          </Button>
        )}
      </Section>

      <Section title="Colours">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Foreground">
            <div className="flex flex-col gap-2">
              <div className="border-border inline-flex w-fit rounded-full border p-0.5">
                <button
                  type="button"
                  onClick={() => setFgKind('solid')}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${fgKind === 'solid' ? 'bg-brand text-on-brand' : 'text-muted'}`}
                >
                  Solid
                </button>
                <button
                  type="button"
                  onClick={() => setFgKind('gradient')}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${fgKind === 'gradient' ? 'bg-brand text-on-brand' : 'text-muted'}`}
                >
                  Gradient
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="border-border h-9 w-11 cursor-pointer rounded-lg border p-1"
                  aria-label={fgKind === 'solid' ? 'Foreground colour' : 'Gradient start colour'}
                />
                {fgKind === 'gradient' && (
                  <input
                    type="color"
                    value={fgColor2}
                    onChange={(e) => setFgColor2(e.target.value)}
                    className="border-border h-9 w-11 cursor-pointer rounded-lg border p-1"
                    aria-label="Gradient end colour"
                  />
                )}
                {fgKind === 'gradient' && (
                  <select
                    value={gradientType}
                    onChange={(e) => setGradientType(e.target.value as 'linear' | 'radial')}
                    className="border-border bg-background h-9 rounded-lg border px-2 text-xs outline-none"
                  >
                    <option value="linear">Linear</option>
                    <option value="radial">Radial</option>
                  </select>
                )}
              </div>
              {fgKind === 'gradient' && gradientType === 'linear' && (
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="accent-brand w-full max-w-[180px]"
                  aria-label="Gradient angle"
                />
              )}
            </div>
          </Field>

          <Field label="Background">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={bgTransparent}
                  onChange={(e) => setBgTransparent(e.target.checked)}
                  className="accent-brand size-4"
                />
                Transparent
              </label>
              {!bgTransparent && (
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="border-border h-9 w-11 cursor-pointer rounded-lg border p-1"
                />
              )}
            </div>
          </Field>

          <Field label="Eye colour">
            <div className="flex flex-col gap-2">
              <div className="border-border inline-flex w-fit rounded-full border p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomizeEyes(false)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${!customizeEyes ? 'bg-brand text-on-brand' : 'text-muted'}`}
                >
                  Same
                </button>
                <button
                  type="button"
                  onClick={() => setCustomizeEyes(true)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${customizeEyes ? 'bg-brand text-on-brand' : 'text-muted'}`}
                >
                  Other
                </button>
              </div>
              <div className={`flex items-center gap-2 ${customizeEyes ? '' : 'pointer-events-none opacity-40'}`}>
                <input
                  type="color"
                  value={eyeFrameColor}
                  onChange={(e) => setEyeFrameColor(e.target.value)}
                  disabled={!customizeEyes}
                  aria-label="Eye frame colour"
                  title="Eye frame"
                  className="border-border h-9 w-11 cursor-pointer rounded-lg border p-1"
                />
                <input
                  type="color"
                  value={eyeBallColor}
                  onChange={(e) => setEyeBallColor(e.target.value)}
                  disabled={!customizeEyes}
                  aria-label="Eye ball colour"
                  title="Eye ball"
                  className="border-border h-9 w-11 cursor-pointer rounded-lg border p-1"
                />
              </div>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Shapes and logo">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Module shape">
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-3">
              {BODY_SHAPE_OPTIONS.map((option) => (
                <ShapeSwatch
                  key={option.id}
                  option={option}
                  active={bodyShape === option.id}
                  onClick={() => setBodyShape(option.id as BodyShape)}
                />
              ))}
            </div>
          </Field>
          <Field label="Eye frame shape">
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-2">
              {EYE_SHAPE_OPTIONS.map((option) => (
                <ShapeSwatch
                  key={option.id}
                  option={option}
                  active={eyeFrameShape === option.id}
                  onClick={() => setEyeFrameShape(option.id as EyeShape)}
                />
              ))}
            </div>
          </Field>
          <Field label="Eye ball shape">
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-2">
              {EYE_SHAPE_OPTIONS.map((option) => (
                <ShapeSwatch
                  key={option.id}
                  option={option}
                  active={eyeBallShape === option.id}
                  onClick={() => setEyeBallShape(option.id as EyeShape)}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="border-border border-t pt-3">
          <Field label="Logo" hint="Pick a quick logo or upload your own. Kept small; error correction is raised automatically so the code still scans.">
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {LOGO_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={`Use the ${preset.label} icon`}
                    disabled={logoBusy}
                    onClick={() => void handleLogoPreset(preset)}
                    className="shrink-0 rounded-full"
                  >
                    <TypeGlyph id={preset.id as QrTypeId} className="size-9" />
                  </button>
                ))}
              </div>
              {logo ? (
                <div className="flex items-center gap-3">
                  <img
                    src={logo.dataUrl}
                    alt="Selected logo"
                    className="border-border size-11 rounded-lg border object-contain"
                  />
                  <Button size="sm" variant="secondary" onClick={() => setLogo(null)}>
                    <X aria-hidden className="size-4" />
                    Remove
                  </Button>
                </div>
              ) : (
                <FileUpload
                  rule={LOGO_RULE}
                  accept="image/*"
                  onFiles={(files) => void handleLogoFiles(files)}
                  disabled={logoBusy}
                />
              )}
              {logoError && <Notice>{logoError}</Notice>}
            </div>
          </Field>

          {logo && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
              <div className="max-w-[220px] flex-1">
                <SliderField
                  label="Logo size"
                  value={logoSizePercent}
                  onChange={setLogoSizePercent}
                  min={10}
                  max={35}
                  suffix="%"
                />
              </div>
              <label className="flex items-center gap-2 pb-1.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={logoPadding}
                  onChange={(e) => setLogoPadding(e.target.checked)}
                  className="accent-brand size-4"
                />
                Background behind logo
              </label>
            </div>
          )}
        </div>
      </Section>

      <Section title="Advanced">
        <Field label="Error correction" hint="Higher levels stay scannable even if part of the code is damaged or covered.">
          <div className="grid grid-cols-4 gap-1.5">
            {ECC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                onClick={() => setEcc(option.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${ecc === option.value ? 'bg-brand border-brand text-on-brand' : 'border-border text-muted'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
        <SliderField label="Quiet zone margin" value={margin} onChange={setMargin} min={0} max={10} suffix=" modules" />
        <SliderField label="Output size" value={sizePx} onChange={setSizePx} min={200} max={2000} step={50} suffix=" px" />
      </Section>
    </ControlPanel>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">{panel}</div>
      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <h2 className="text-sm font-semibold">QR Preview</h2>
        {preview}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Button onClick={downloadPng} disabled={!canRender} className="h-11 w-full text-sm">
            <Download aria-hidden className="size-4" />
            Download PNG
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={downloadSvg} disabled={!canRender} className="flex-1">
              SVG
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadWebp} disabled={!canRender} className="flex-1">
              WebP
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
