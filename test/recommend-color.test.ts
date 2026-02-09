import test from "node:test";
import assert from "node:assert/strict";
import {
  recommendDesignSystemColorsForContrast,
  recommendTokensForManualColorReview,
} from "../src/rules/recommend-color.js";

test("recommends passing design-system tokens for contrast", () => {
  const recommendation = recommendDesignSystemColorsForContrast(
    {
      "text.primary": "#111827",
      "text.muted": "#9CA3AF",
      "text.inverse": "#FFFFFF",
    },
    { r: 156, g: 163, b: 175, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 },
    4.5,
  );

  assert.ok(recommendation);
  assert.match(recommendation!, /text\.primary/);
});

test("returns explicit message when no token can pass threshold", () => {
  const recommendation = recommendDesignSystemColorsForContrast(
    {
      "text.light": "#F8FAFC",
    },
    { r: 248, g: 250, b: 252, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 },
    7,
  );

  assert.match(recommendation ?? "", /No design-system color token meets/);
});

test("manual-review recommendation includes variable token preview", () => {
  const recommendation = recommendTokensForManualColorReview({
    "text.primary": "#111827",
    "text.secondary": "#1F2937",
  });

  assert.ok(recommendation);
  assert.match(recommendation!, /Contrast data unavailable/);
  assert.match(recommendation!, /text.primary/);
});
