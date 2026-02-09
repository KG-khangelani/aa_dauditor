import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, isLargeText } from "../src/core/color.js";

test("contrast ratio is computed correctly for black on white", () => {
  const ratio = contrastRatio(
    { r: 0, g: 0, b: 0, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 },
  );

  assert.ok(ratio > 20.9);
  assert.ok(ratio < 21.1);
});

test("large text threshold classification", () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(isLargeText(16, 400), false);
});
