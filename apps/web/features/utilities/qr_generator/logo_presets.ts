import type { QrLogoStyle } from './qr_render';

/** Quick pick logos — the same brand marks shown in the type grid, one click away from being
 *  embedded as the QR's centre logo. Drawn with plain canvas primitives (no icon library, no
 *  network fetch) so a click resolves instantly and never depends on an image loading. */
export interface LogoPreset {
  id: string;
  label: string;
  background: string;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
  rounded?: boolean;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlyph(ctx: CanvasRenderingContext2D, size: number, text: string): void {
  ctx.font = `700 ${size * 0.42}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.02);
}

function drawCamera(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.lineWidth = size * 0.05;
  roundRectPath(ctx, size * 0.2, size * 0.2, size * 0.6, size * 0.6, size * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.67, size * 0.33, size * 0.025, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlay(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  ctx.moveTo(size * 0.38, size * 0.28);
  ctx.lineTo(size * 0.38, size * 0.72);
  ctx.lineTo(size * 0.74, size * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawSoundwave(ctx: CanvasRenderingContext2D, size: number): void {
  const bars = [0.3, 0.55, 0.4, 0.65, 0.35];
  const barWidth = size * 0.07;
  const gap = size * 0.08;
  const totalWidth = bars.length * barWidth + (bars.length - 1) * gap;
  let x = (size - totalWidth) / 2;
  for (const heightFraction of bars) {
    const barHeight = size * heightFraction;
    roundRectPath(ctx, x, (size - barHeight) / 2, barWidth, barHeight, barWidth / 2);
    ctx.fill();
    x += barWidth + gap;
  }
}

function drawPaperPlane(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  ctx.moveTo(size * 0.22, size * 0.52);
  ctx.lineTo(size * 0.76, size * 0.26);
  ctx.lineTo(size * 0.6, size * 0.76);
  ctx.lineTo(size * 0.5, size * 0.58);
  ctx.closePath();
  ctx.fill();
}

function drawChatBubble(ctx: CanvasRenderingContext2D, size: number): void {
  roundRectPath(ctx, size * 0.22, size * 0.24, size * 0.56, size * 0.44, size * 0.14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.36, size * 0.68);
  ctx.lineTo(size * 0.3, size * 0.8);
  ctx.lineTo(size * 0.48, size * 0.68);
  ctx.closePath();
  ctx.fill();
}

function drawPhone(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  roundRectPath(ctx, -size * 0.28, -size * 0.1, size * 0.2, size * 0.2, size * 0.05);
  ctx.fill();
  roundRectPath(ctx, size * 0.08, -size * 0.1, size * 0.2, size * 0.2, size * 0.05);
  ctx.fill();
  ctx.fillRect(-size * 0.08, -size * 0.035, size * 0.16, size * 0.07);
  ctx.restore();
}

export const LOGO_PRESETS: readonly LogoPreset[] = [
  { id: 'whatsapp', label: 'WhatsApp', background: '#25D366', draw: drawChatBubble },
  { id: 'telegram', label: 'Telegram', background: '#229ED9', draw: drawPaperPlane },
  { id: 'twitter', label: 'Twitter', background: '#1DA1F2', draw: (ctx, s) => drawGlyph(ctx, s, 'X') },
  { id: 'facebook', label: 'Facebook', background: '#1877F2', draw: (ctx, s) => drawGlyph(ctx, s, 'f') },
  {
    id: 'instagram',
    label: 'Instagram',
    background: 'linear-gradient(135deg, #f58529, #dd2a7b 60%, #8134af)',
    draw: drawCamera,
  },
  { id: 'youtube', label: 'YouTube', background: '#FF0000', draw: drawPlay, rounded: true },
  { id: 'linkedin', label: 'LinkedIn', background: '#0A66C2', draw: (ctx, s) => drawGlyph(ctx, s, 'in') },
  { id: 'spotify', label: 'Spotify', background: '#1DB954', draw: drawSoundwave },
  { id: 'paypal', label: 'PayPal', background: '#003087', draw: (ctx, s) => drawGlyph(ctx, s, 'P') },
  { id: 'pinterest', label: 'Pinterest', background: '#E60023', draw: (ctx, s) => drawGlyph(ctx, s, 'P') },
  { id: 'crypto', label: 'Bitcoin', background: '#F7931A', draw: (ctx, s) => drawGlyph(ctx, s, '₿') },
  { id: 'skype', label: 'Skype', background: '#00AFF0', draw: drawPhone },
] as const;

/** Rasterises a preset into the same `QrLogoStyle` shape an uploaded image decodes to, so it
 *  drops into the exact same rendering and download path. */
export async function buildPresetLogo(preset: LogoPreset): Promise<QrLogoStyle> {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A drawing surface is not available in this browser.');

  if (preset.background.startsWith('linear-gradient')) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#f58529');
    gradient.addColorStop(0.6, '#dd2a7b');
    gradient.addColorStop(1, '#8134af');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = preset.background;
  }
  roundRectPath(ctx, 0, 0, size, size, preset.rounded ? size * 0.22 : size / 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  preset.draw(ctx, size);

  const dataUrl = canvas.toDataURL('image/png');
  const bitmap = await createImageBitmap(canvas);
  return { dataUrl, bitmap, sizePercent: 20, padding: true, paddingColor: '#ffffff' };
}
