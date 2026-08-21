/** Decodes the rendered canvas back to text with jsQR, so heavy customisation or a large logo
 *  never ships a code that looks right but cannot actually be scanned. */
export async function checkQrScannable(canvas: HTMLCanvasElement, expectedContent: string): Promise<boolean> {
  const jsQR = (await import('jsqr')).default;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result !== null && result.data === expectedContent;
}
