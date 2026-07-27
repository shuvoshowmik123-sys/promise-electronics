/**
 * Decoded-pixel screenshot comparison (not compressed PNG byte equality).
 * Minimal PNG decoder/encoder for 8-bit RGB/RGBA + filters 0-4.
 */
import { inflateSync, deflateSync } from "zlib";
import { readFileSync } from "fs";

function readU32(buf, o) {
  return buf.readUInt32BE(o);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcBuf = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, c]);
}

function buildPng(width, height, idatData) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  chunks: {
    /* */
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Decode PNG file/buffer → { width, height, data: Uint8ClampedArray RGBA }
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not-a-png");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat = [];

  while (offset + 8 <= buf.length) {
    const len = readU32(buf, offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }

  if (!width || !height) throw new Error("png-no-ihdr");
  if (bitDepth !== 8) throw new Error("png-bitdepth-unsupported");
  if (colorType !== 2 && colorType !== 6) throw new Error("png-colortype-unsupported");

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  let i = 0;
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const row = raw.subarray(i, i + stride);
    i += stride;
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? cur[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      const v = row[x];
      let r;
      if (filter === 0) r = v;
      else if (filter === 1) r = (v + left) & 255;
      else if (filter === 2) r = (v + up) & 255;
      else if (filter === 3) r = (v + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        r = (v + pr) & 255;
      } else throw new Error("png-filter-" + filter);
      cur[x] = r;
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = bpp === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

export function encodeRgbaPng(width, height, rgba) {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    const src = y * stride;
    for (let j = 0; j < stride; j++) raw[rowStart + 1 + j] = rgba[src + j];
  }
  return buildPng(width, height, deflateSync(raw));
}

export function encodeSolidPng(width, height, rgba = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return encodeRgbaPng(width, height, data);
}

/**
 * Compare decoded pixels of two PNGs.
 */
export function comparePngPixels(a, b, options = {}) {
  const threshold = options.threshold ?? 0.01;
  const noise = options.noiseTolerance ?? 8;
  let imgA;
  let imgB;
  try {
    imgA = typeof a === "string" ? decodePng(readFileSync(a)) : decodePng(a);
    imgB = typeof b === "string" ? decodePng(readFileSync(b)) : decodePng(b);
  } catch (e) {
    return {
      changed: false,
      ratio: 0,
      changedPixels: 0,
      total: 0,
      width: 0,
      height: 0,
      region: null,
      threshold,
      reason: "decode-failed:" + (e.message || e),
    };
  }

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      changed: false,
      ratio: 0,
      changedPixels: 0,
      total: 0,
      width: imgA.width,
      height: imgA.height,
      region: null,
      threshold,
      reason: "dimension-mismatch",
      dims: { a: [imgA.width, imgA.height], b: [imgB.width, imgB.height] },
    };
  }

  const w = imgA.width;
  const h = imgA.height;
  const region = options.region || { x: 0, y: 0, w, h };
  const x0 = Math.max(0, Math.floor(region.x || 0));
  const y0 = Math.max(0, Math.floor(region.y || 0));
  const x1 = Math.min(w, x0 + Math.floor(region.w || w));
  const y1 = Math.min(h, y0 + Math.floor(region.h || h));

  let changedPixels = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      total++;
      if (
        Math.abs(imgA.data[i] - imgB.data[i]) > noise ||
        Math.abs(imgA.data[i + 1] - imgB.data[i + 1]) > noise ||
        Math.abs(imgA.data[i + 2] - imgB.data[i + 2]) > noise
      ) {
        changedPixels++;
      }
    }
  }

  const ratio = total ? changedPixels / total : 0;
  const cameraChanged = Boolean(options.cameraChanged);
  // Pixel-only path: require ratio >= threshold. cameraChanged alone never invents a pass.
  const changed = ratio >= threshold;

  return {
    changed,
    ratio,
    changedPixels,
    total,
    width: w,
    height: h,
    region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    threshold,
    noiseTolerance: noise,
    cameraChanged,
    reason: changed ? "significant-pixel-change" : "insignificant-or-identical",
  };
}

/**
 * Pan/zoom (or map/camera action) evidence gate.
 * Requires BOTH significant decoded pixel change in the action region AND
 * a real camera/action state change. Identical before/after always fails.
 *
 * @param {string|Buffer} beforePng
 * @param {string|Buffer} afterPng
 * @param {{
 *   region?: {x:number,y:number,w:number,h:number},
 *   threshold?: number,
 *   noiseTolerance?: number,
 *   cameraBefore?: object|null,
 *   cameraAfter?: object|null,
 *   actionStateChanged?: boolean,
 * }} options
 */
export function comparePanZoomEvidence(beforePng, afterPng, options = {}) {
  const pixels = comparePngPixels(beforePng, afterPng, {
    threshold: options.threshold ?? 0.008,
    noiseTolerance: options.noiseTolerance ?? 10,
    region: options.region,
  });

  let cameraChanged = Boolean(options.actionStateChanged);
  if (!cameraChanged && options.cameraBefore != null && options.cameraAfter != null) {
    try {
      cameraChanged = JSON.stringify(options.cameraBefore) !== JSON.stringify(options.cameraAfter);
    } catch {
      cameraChanged = false;
    }
  }

  const pixelsChanged = Boolean(pixels.changed) && pixels.reason !== "dimension-mismatch" && pixels.reason !== "decode-failed";
  const identical = pixels.changedPixels === 0 && !pixels.reason?.startsWith("decode") && pixels.reason !== "dimension-mismatch";
  const ok = pixelsChanged && cameraChanged && !identical;

  let reason = "pan-zoom-proven";
  if (identical || (!pixelsChanged && pixels.reason === "insignificant-or-identical")) {
    reason = "identical-or-insignificant-pixels";
  } else if (!pixelsChanged) {
    reason = pixels.reason || "pixels-not-changed";
  } else if (!cameraChanged) {
    reason = "pixels-changed-but-camera-state-unchanged";
  }

  return {
    ok,
    changed: ok,
    pixelsChanged,
    cameraChanged,
    identical: Boolean(identical),
    ratio: pixels.ratio,
    changedPixels: pixels.changedPixels,
    total: pixels.total,
    region: pixels.region,
    threshold: pixels.threshold,
    reason,
    pixelReason: pixels.reason,
  };
}
