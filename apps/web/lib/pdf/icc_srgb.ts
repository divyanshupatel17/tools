/** Hand-built ICC v2.1 sRGB display profile (ICC.1:2001-04 §6) for a PDF/A `/OutputIntent`,
 * since there's no npm package for this and no honest way to bundle third-party profile bytes.
 * Only the eight tags a display profile needs are included: desc, wtpt, rXYZ/gXYZ/bXYZ,
 * rTRC/gTRC/bTRC, cprt. */

function be32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function be16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function sig(fourCc: string): number[] {
  return Array.from(fourCc, (char) => char.charCodeAt(0));
}

/** ICC's fixed-point s15Fixed16Number: value * 65536, rounded, as a signed 32-bit big-endian int. */
function s15Fixed16(value: number): number[] {
  return be32(Math.round(value * 65536) >>> 0);
}

function padTo4(bytes: number[]): number[] {
  while (bytes.length % 4 !== 0) bytes.push(0);
  return bytes;
}

/** `textDescriptionType` ('desc'): ASCII description, plus the empty Unicode/Macintosh fields
 * every reader still expects present even when unused. */
function descTag(text: string): number[] {
  const ascii = [...text].map((char) => char.charCodeAt(0));
  ascii.push(0); // NUL terminator, counted in the length below.
  return padTo4([
    ...sig('desc'),
    ...be32(0), // reserved
    ...be32(ascii.length),
    ...ascii,
    ...be32(0), // Unicode language code
    ...be32(0), // Unicode description length (none)
    ...be16(0), // Macintosh script code
    0, // Macintosh description length (none)
    ...new Array(67).fill(0), // Macintosh description buffer, unused
  ]);
}

function textTag(text: string): number[] {
  const ascii = [...text].map((char) => char.charCodeAt(0));
  ascii.push(0);
  return padTo4([...sig('text'), ...be32(0), ...ascii]);
}

function xyzTag(x: number, y: number, z: number): number[] {
  return padTo4([...sig('XYZ '), ...be32(0), ...s15Fixed16(x), ...s15Fixed16(y), ...s15Fixed16(z)]);
}

/** `curveType` ('curv') with a single gamma entry — a power-law approximation of sRGB's actual
 * piecewise transfer function, good enough since exact colourimetry isn't the goal here. */
function gammaCurveTag(gamma: number): number[] {
  const u8Fixed8 = Math.round(gamma * 256) & 0xffff;
  return padTo4([...sig('curv'), ...be32(0), ...be32(1), ...be16(u8Fixed8)]);
}

export function buildSrgbIccProfile(): Uint8Array {
  const tags: Array<[string, number[]]> = [
    ['desc', descTag('sRGB (generated)')],
    ['cprt', textTag('Public domain')],
    ['wtpt', xyzTag(0.9642, 1.0, 0.8249)], // D50 white point, the PCS illuminant every ICC profile is adapted to.
    ['rXYZ', xyzTag(0.4361, 0.2225, 0.0139)],
    ['gXYZ', xyzTag(0.3851, 0.7169, 0.0971)],
    ['bXYZ', xyzTag(0.1431, 0.0606, 0.7139)],
    ['rTRC', gammaCurveTag(2.2)],
    ['gTRC', gammaCurveTag(2.2)],
    ['bTRC', gammaCurveTag(2.2)],
  ];

  const headerSize = 128;
  const tagTableSize = 4 + tags.length * 12;
  let offset = headerSize + tagTableSize;

  const tagEntries: number[] = [];
  const tagData: number[] = [];
  for (const [name, data] of tags) {
    tagEntries.push(...sig(name), ...be32(offset), ...be32(data.length));
    tagData.push(...data);
    offset += data.length;
  }

  const totalSize = offset;

  const header = [
    ...be32(totalSize),
    ...sig('none'), // preferred CMM type: none claimed
    ...be32(0x02100000), // profile version 2.1.0
    ...sig('mntr'), // device class: display/monitor
    ...sig('RGB '), // data colour space
    ...sig('XYZ '), // profile connection space
    // Profile creation date/time — fixed rather than `Date.now()`, so the same input always
    // produces byte-identical output (useful for tests, and no reason for it to vary).
    ...be16(2026),
    ...be16(1),
    ...be16(1),
    ...be16(0),
    ...be16(0),
    ...be16(0),
    ...sig('acsp'), // required file signature
    ...be32(0), // primary platform: unspecified
    ...be32(0), // profile flags
    ...be32(0), // device manufacturer
    ...be32(0), // device model
    ...be32(0),
    ...be32(0), // device attributes (8 bytes)
    ...be32(0), // rendering intent: perceptual
    ...s15Fixed16(0.9642), // PCS illuminant XYZ (D50, fixed by the ICC spec)
    ...s15Fixed16(1.0),
    ...s15Fixed16(0.8249),
    ...sig('tool'), // profile creator
    ...new Array(16).fill(0), // profile ID (MD5) — left unset, which is valid ("not computed")
    ...new Array(28).fill(0), // reserved
  ];

  const tagTable = [...be32(tags.length), ...tagEntries];

  return new Uint8Array([...header, ...tagTable, ...tagData]);
}
