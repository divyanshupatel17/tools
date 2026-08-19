/**
 * Ports the reference project's default residual cleanup pass — `applySoftResidualCleanup` in
 * `videoCleanupBackends.js`, default path only (`highQuality=false`, `protectStructure=false`).
 *
 * The reference project runs this after every processed video frame's alpha blend, unconditionally
 * (`DEFAULT_RESIDUAL_CLEANUP_STRENGTH = 1.5`, always on unless explicitly disabled). It exists
 * because the blend alone never fully erases a re encoded watermark: the alpha template is only an
 * approximation, and video re encoding (deblocking, chroma subsampling) distorts the mark's real
 * footprint just enough that a faint trace survives the blend. This inpaints the watermark's
 * footprint (weighted by a gradient map built from the alpha template) and blends it back in with
 * the surrounding texture preserved, rather than leaving the raw blend output untouched.
 */

interface RegionPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

type PaddedImageData = { width: number; height: number; data: Uint8ClampedArray };

function createGaussianKernel(sigma: number, radius = Math.ceil(sigma * 3)): { kernel: Float32Array; radius: number } {
  const safeSigma = Math.max(0.01, sigma);
  const safeRadius = Math.max(1, Math.round(radius));
  const kernel = new Float32Array(safeRadius * 2 + 1);
  let sum = 0;

  for (let i = -safeRadius; i <= safeRadius; i += 1) {
    const value = Math.exp(-(i * i) / (2 * safeSigma * safeSigma));
    kernel[i + safeRadius] = value;
    sum += value;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = kernel[i]! / sum;

  return { kernel, radius: safeRadius };
}

function gaussianBlurFloatMap(source: Float32Array, width: number, height: number, sigma: number, radius?: number): Float32Array {
  const { kernel, radius: r } = createGaussianKernel(sigma, radius);
  const temp = new Float32Array(source.length);
  const output = new Float32Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const xx = Math.max(0, Math.min(width - 1, x + dx));
        sum += source[y * width + xx]! * kernel[dx + r]!;
      }
      temp[y * width + x] = sum;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + dy));
        sum += temp[yy * width + x]! * kernel[dy + r]!;
      }
      output[y * width + x] = sum;
    }
  }

  return output;
}

function gaussianBlurPaddedImageData(imageData: PaddedImageData, sigma: number, radius?: number): Uint8ClampedArray {
  const { width, height } = imageData;
  const source = imageData.data;
  const { kernel, radius: r } = createGaussianKernel(sigma, radius);
  const temp = new Float32Array(source.length);
  const output = new Uint8ClampedArray(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dst = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = Math.max(0, Math.min(width - 1, x + dx));
          sum += source[(y * width + xx) * 4 + c]! * kernel[dx + r]!;
        }
        temp[dst + c] = sum;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dst = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let dy = -r; dy <= r; dy += 1) {
          const yy = Math.max(0, Math.min(height - 1, y + dy));
          sum += temp[(yy * width + x) * 4 + c]! * kernel[dy + r]!;
        }
        output[dst + c] = Math.max(0, Math.min(255, Math.round(sum)));
      }
    }
  }

  return output;
}

/** Fills the watermark footprint from its unmasked neighbors: a coarse seed ring, then iterative averaging. */
function inpaintPaddedImageData(imageData: PaddedImageData, weights: Float32Array, iterations: number): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const active = new Uint8Array(width * height);
  const current = new Float32Array(data.length);
  const next = new Float32Array(data.length);
  current.set(data);
  next.set(data);

  for (let i = 0; i < weights.length; i += 1) active[i] = weights[i]! > 0.08 ? 1 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!active[pixel]) continue;

      let count = 0;
      const sum: [number, number, number] = [0, 0, 0];
      for (let radius = 1; radius <= 8 && count === 0; radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const neighbor = yy * width + xx;
            if (active[neighbor]) continue;

            const idx = neighbor * 4;
            sum[0] += data[idx]!;
            sum[1] += data[idx + 1]!;
            sum[2] += data[idx + 2]!;
            count += 1;
          }
        }
      }

      if (count > 0) {
        const idx = pixel * 4;
        current[idx] = sum[0] / count;
        current[idx + 1] = sum[1] / count;
        current[idx + 2] = sum[2] / count;
        next[idx] = current[idx]!;
        next[idx + 1] = current[idx + 1]!;
        next[idx + 2] = current[idx + 2]!;
      }
    }
  }

  const rounds = Math.max(4, Math.round(iterations));
  for (let round = 0; round < rounds; round += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const idx = pixel * 4;
        if (!active[pixel]) {
          next[idx] = current[idx]!;
          next[idx + 1] = current[idx + 1]!;
          next[idx + 2] = current[idx + 2]!;
          next[idx + 3] = current[idx + 3]!;
          continue;
        }

        let count = 0;
        const sum: [number, number, number] = [0, 0, 0];
        const neighbors: [number, number][] = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
          [x - 1, y - 1],
          [x + 1, y - 1],
          [x - 1, y + 1],
          [x + 1, y + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = (ny * width + nx) * 4;
          sum[0] += current[nIdx]!;
          sum[1] += current[nIdx + 1]!;
          sum[2] += current[nIdx + 2]!;
          count += 1;
        }

        if (count > 0) {
          next[idx] = sum[0] / count;
          next[idx + 1] = sum[1] / count;
          next[idx + 2] = sum[2] / count;
          next[idx + 3] = current[idx + 3]!;
        }
      }
    }
    current.set(next);
  }

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < output.length; i += 1) output[i] = Math.max(0, Math.min(255, Math.round(current[i]!)));
  return output;
}

/** Sobel gradient of the alpha template, dilated and blurred: highlights the mark's edge, not its flat interior. */
function buildGradientWeightMap(alphaMap: Float32Array, width: number, height: number, strength: number): Float32Array {
  const gradient = new Float32Array(width * height);
  let maxGradient = 0;
  const sample = (x: number, y: number): number => {
    const xx = Math.max(0, Math.min(width - 1, x));
    const yy = Math.max(0, Math.min(height - 1, y));
    return alphaMap[yy * width + xx] ?? 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const gx =
        -sample(x - 1, y - 1) - 2 * sample(x - 1, y) - sample(x - 1, y + 1) +
        sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1);
      const gy =
        -sample(x - 1, y - 1) - 2 * sample(x, y - 1) - sample(x + 1, y - 1) +
        sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1);
      const value = Math.sqrt(gx * gx + gy * gy);
      gradient[i] = value;
      if (value > maxGradient) maxGradient = value;
    }
  }
  if (maxGradient <= 0) return gradient;

  const dilated = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let localMax = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          localMax = Math.max(localMax, gradient[yy * width + xx]!);
        }
      }
      dilated[y * width + x] = Math.sqrt(localMax / maxGradient);
    }
  }

  const smoothed = gaussianBlurFloatMap(dilated, width, height, 1.15);
  for (let i = 0; i < smoothed.length; i += 1) smoothed[i] = Math.min(1, smoothed[i]! * strength);
  return smoothed;
}

function mapRoiWeightsToPaddedWeights(
  roiWeights: Float32Array,
  position: RegionPosition,
  padded: { width: number; height: number },
  padX: number,
  padY: number,
): Float32Array {
  const paddedWeights = new Float32Array(padded.width * padded.height);

  for (let y = 0; y < position.height; y += 1) {
    const py = position.y - padY + y;
    if (py < 0 || py >= padded.height) continue;
    for (let x = 0; x < position.width; x += 1) {
      const px = position.x - padX + x;
      if (px < 0 || px >= padded.width) continue;
      paddedWeights[py * padded.width + px] = roiWeights[y * position.width + x]!;
    }
  }

  return paddedWeights;
}

/**
 * Runs the reference's default residual cleanup over one frame's watermark region, already drawn
 * onto `ctx`: reads a padded ROI back out, inpaints the footprint, and blends the repair in with
 * the original texture preserved, weighted by how strongly each pixel sat on the alpha template's
 * edge. Writes the result straight back onto `ctx`.
 */
export function applySoftResidualCleanup(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  position: RegionPosition,
  alphaMap: Float32Array,
  strength: number,
): void {
  if (!Number.isFinite(strength) || strength <= 0) return;

  const padding = Math.max(24, Math.round(Math.min(position.width, position.height) * 0.9));
  const padX = Math.max(0, position.x - padding);
  const padY = Math.max(0, position.y - padding);
  const padRight = Math.min(ctx.canvas.width, position.x + position.width + padding);
  const padBottom = Math.min(ctx.canvas.height, position.y + position.height + padding);
  const padded = ctx.getImageData(padX, padY, padRight - padX, padBottom - padY);

  const roiWeights = buildGradientWeightMap(alphaMap, position.width, position.height, strength);
  const paddedWeights = mapRoiWeightsToPaddedWeights(roiWeights, position, padded, padX, padY);
  const weights = gaussianBlurFloatMap(paddedWeights, padded.width, padded.height, 1);
  const textureBase = gaussianBlurPaddedImageData(padded, 2.2, 5);

  const inpainted = inpaintPaddedImageData(
    padded,
    weights,
    Math.max(18, Math.round(Math.min(position.width, position.height) / 2)),
  );
  const blurRadius = Math.max(2, Math.round(Math.min(position.width, position.height) / 18));
  const repairedSource = gaussianBlurPaddedImageData(
    { width: padded.width, height: padded.height, data: inpainted },
    blurRadius * 0.8,
    blurRadius,
  );

  for (let pixel = 0; pixel < weights.length; pixel += 1) {
    const weight = Math.min(1, Math.max(0, weights[pixel]!));
    const blendWeight = Math.min(1, weight * 1.25);
    if (blendWeight <= 0.01) continue;

    const idx = pixel * 4;
    for (let c = 0; c < 3; c += 1) {
      const texture = padded.data[idx + c]! - textureBase[idx + c]!;
      const textureGain = Math.max(0.05, 0.78 - blendWeight * 0.9);
      const repaired = Math.max(0, Math.min(255, repairedSource[idx + c]! + texture * textureGain));
      padded.data[idx + c] = Math.round(padded.data[idx + c]! * (1 - blendWeight) + repaired * blendWeight);
    }
  }

  ctx.putImageData(padded, padX, padY);
}
