import { inflateSync } from "node:zlib";
import type {
  FigmaTargetPayload,
  NormalizedBounds,
  NormalizedColor,
  NormalizedNode,
  NormalizedTarget,
} from "./types.js";
import { nodeMap } from "../normalize/query.js";

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function createScreenshotBackgroundSampler(
  target: NormalizedTarget,
  screenshot: FigmaTargetPayload["screenshot"] | undefined,
): ((node: NormalizedNode, foreground?: NormalizedColor) => NormalizedColor | undefined) | undefined {
  if (!screenshot?.bytes || screenshot.ext !== "png") {
    return undefined;
  }

  const decoded = decodePng(screenshot.bytes);
  if (!decoded) {
    return undefined;
  }

  const map = nodeMap(target);
  const accumulated = accumulatedBoundsById(target, map);
  const rootBounds = accumulated.get(target.nodeId);
  if (!rootBounds) {
    return undefined;
  }

  return (node: NormalizedNode, foreground?: NormalizedColor): NormalizedColor | undefined => {
    const absolute = accumulated.get(node.id);
    if (!absolute) {
      return undefined;
    }
    const local: NormalizedBounds = {
      x: absolute.x - rootBounds.x,
      y: absolute.y - rootBounds.y,
      width: absolute.width,
      height: absolute.height,
    };

    return sampleBackgroundAroundRect(decoded, local, foreground);
  };
}

function decodePng(bytes: Uint8Array): DecodedPng | undefined {
  const SIGNATURE = "89504e470d0a1a0a";
  if (bytes.length < 8 || Buffer.from(bytes.slice(0, 8)).toString("hex") !== SIGNATURE) {
    return undefined;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const type = Buffer.from(bytes.slice(offset + 4, offset + 8)).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      return undefined;
    }

    const data = bytes.slice(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset = crcEnd;
  }

  if (
    width <= 0 ||
    height <= 0 ||
    bitDepth !== 8 ||
    (colorType !== 6 && colorType !== 2) ||
    idatChunks.length === 0
  ) {
    return undefined;
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    return undefined;
  }

  const reconstructed = new Uint8Array(height * stride);
  let srcOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[srcOffset];
    srcOffset += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[srcOffset + x];
      const left = x >= bpp ? reconstructed[rowStart + x - bpp] : 0;
      const up = y > 0 ? reconstructed[rowStart - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? reconstructed[rowStart - stride + x - bpp] : 0;
      reconstructed[rowStart + x] = applyFilter(filterType, rawByte, left, up, upLeft);
    }
    srcOffset += stride;
  }

  const rgba = new Uint8Array(width * height * 4);
  if (colorType === 6) {
    rgba.set(reconstructed);
  } else {
    for (let i = 0, j = 0; i < reconstructed.length; i += 3, j += 4) {
      rgba[j] = reconstructed[i];
      rgba[j + 1] = reconstructed[i + 1];
      rgba[j + 2] = reconstructed[i + 2];
      rgba[j + 3] = 255;
    }
  }

  return { width, height, rgba };
}

function applyFilter(
  filterType: number,
  rawByte: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  switch (filterType) {
    case 0:
      return rawByte;
    case 1:
      return (rawByte + left) & 0xff;
    case 2:
      return (rawByte + up) & 0xff;
    case 3:
      return (rawByte + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      return rawByte;
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function accumulatedBoundsById(
  target: NormalizedTarget,
  map: Map<string, NormalizedNode>,
): Map<string, NormalizedBounds> {
  const out = new Map<string, NormalizedBounds>();
  const visiting = new Set<string>();

  const resolve = (node: NormalizedNode): NormalizedBounds | undefined => {
    if (out.has(node.id)) {
      return out.get(node.id);
    }
    if (!node.bounds || visiting.has(node.id)) {
      return node.bounds;
    }

    visiting.add(node.id);
    const parent = node.parentId ? map.get(node.parentId) : undefined;
    const parentBounds = parent ? resolve(parent) : undefined;
    visiting.delete(node.id);

    const absolute = parentBounds
      ? {
          x: parentBounds.x + node.bounds.x,
          y: parentBounds.y + node.bounds.y,
          width: node.bounds.width,
          height: node.bounds.height,
        }
      : node.bounds;
    out.set(node.id, absolute);
    return absolute;
  };

  for (const node of target.nodes) {
    resolve(node);
  }

  return out;
}

function sampleBackgroundAroundRect(
  image: DecodedPng,
  bounds: NormalizedBounds,
  foreground?: NormalizedColor,
): NormalizedColor | undefined {
  const left = Math.floor(bounds.x);
  const top = Math.floor(bounds.y);
  const right = Math.ceil(bounds.x + bounds.width);
  const bottom = Math.ceil(bounds.y + bounds.height);
  const midX = Math.floor((left + right) / 2);
  const midY = Math.floor((top + bottom) / 2);
  const pad = 2;

  const points: Array<[number, number]> = [
    [left - pad, midY],
    [right + pad, midY],
    [midX, top - pad],
    [midX, bottom + pad],
    [left - pad, top - pad],
    [right + pad, top - pad],
    [left - pad, bottom + pad],
    [right + pad, bottom + pad],
  ];

  const colors: NormalizedColor[] = [];
  for (const [x, y] of points) {
    const clampedX = clamp(x, 0, image.width - 1);
    const clampedY = clamp(y, 0, image.height - 1);
    const color = samplePixel(image, clampedX, clampedY);
    if (!color || color.a < 0.1) {
      continue;
    }
    if (foreground && rgbDistance(color, foreground) < 12) {
      continue;
    }
    colors.push(color);
  }

  if (colors.length === 0) {
    return undefined;
  }

  const buckets = new Map<string, { count: number; color: NormalizedColor }>();
  for (const color of colors) {
    const key = `${Math.round(color.r / 8)}-${Math.round(color.g / 8)}-${Math.round(
      color.b / 8,
    )}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { count: 1, color });
      continue;
    }
    current.count += 1;
  }

  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return best?.color;
}

function samplePixel(image: DecodedPng, x: number, y: number): NormalizedColor | undefined {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return undefined;
  }
  const idx = (y * image.width + x) * 4;
  return {
    r: image.rgba[idx],
    g: image.rgba[idx + 1],
    b: image.rgba[idx + 2],
    a: image.rgba[idx + 3] / 255,
  };
}

function rgbDistance(a: NormalizedColor, b: NormalizedColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
