import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { createScreenshotBackgroundSampler } from "../src/core/screenshot-sampler.js";
import type { NormalizedTarget } from "../src/core/types.js";

test("createScreenshotBackgroundSampler samples background around text bounds", () => {
  const pngBytes = buildSolidPng(24, 24, { r: 248, g: 249, b: 250, a: 255 });
  const target: NormalizedTarget = {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    warnings: [],
    nodes: [
      {
        id: "1:1",
        name: "Root",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 24, height: 24 },
        fills: [],
        strokes: [],
        isInteractive: false,
      },
      {
        id: "1:2",
        parentId: "1:1",
        name: "Resource Page",
        type: "TEXT",
        bounds: { x: 4, y: 6, width: 10, height: 8 },
        fills: [{ r: 16, g: 43, b: 124, a: 1 }],
        strokes: [],
        text: "Resource Page",
        isInteractive: false,
      },
    ],
  };

  const sampler = createScreenshotBackgroundSampler(target, {
    bytes: pngBytes,
    ext: "png",
  });
  assert.ok(sampler);

  const node = target.nodes.find((entry) => entry.id === "1:2")!;
  const sampled = sampler!(node, node.fills[0]);
  assert.ok(sampled);
  assert.equal(sampled?.r, 248);
  assert.equal(sampled?.g, 249);
  assert.equal(sampled?.b, 250);
});

test("createScreenshotBackgroundSampler ignores diagonal-only corner pixels around text", () => {
  const diagonalPoints = new Set(["4,4", "18,4", "4,18", "18,18"]);
  const pngBytes = buildPng(24, 24, (x, y) =>
    diagonalPoints.has(`${x},${y}`)
      ? { r: 255, g: 0, b: 0, a: 255 }
      : { r: 0, g: 0, b: 0, a: 0 },
  );

  const target: NormalizedTarget = {
    figmaUrl: "https://www.figma.com/file/demo?node-id=1-1",
    nodeId: "1:1",
    frameName: "Demo",
    warnings: [],
    nodes: [
      {
        id: "1:1",
        name: "Root",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 24, height: 24 },
        fills: [],
        strokes: [],
        isInteractive: false,
      },
      {
        id: "1:2",
        parentId: "1:1",
        name: "Resource Page",
        type: "TEXT",
        bounds: { x: 8, y: 8, width: 8, height: 8 },
        fills: [{ r: 16, g: 43, b: 124, a: 1 }],
        strokes: [],
        text: "Resource Page",
        isInteractive: false,
      },
    ],
  };

  const sampler = createScreenshotBackgroundSampler(target, {
    bytes: pngBytes,
    ext: "png",
  });
  assert.ok(sampler);

  const node = target.nodes.find((entry) => entry.id === "1:2")!;
  const sampled = sampler!(node, node.fills[0]);
  assert.equal(sampled, undefined);
});

function buildSolidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number },
): Uint8Array {
  return buildPng(width, height, () => color);
}

function buildPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => { r: number; g: number; b: number; a: number },
): Uint8Array {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < width; x += 1) {
      const p = pixel(x, y);
      const px = rowStart + 1 + x * 4;
      raw[px] = p.r;
      raw[px + 1] = p.g;
      raw[px + 2] = p.b;
      raw[px + 3] = p.a;
    }
  }

  const idat = deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", iend),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); // decoder does not verify CRC.
  return Buffer.concat([length, typeBuf, data, crc]);
}
