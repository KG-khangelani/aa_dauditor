import test from "node:test";
import assert from "node:assert/strict";
import { extractDesignSystemColorsFromVariableDefs } from "../src/figma/variable-colors.js";

test("extracts token colors from map-style variable defs", () => {
  const extracted = extractDesignSystemColorsFromVariableDefs({
    "text.primary": "#1f2937",
    "text.inverse": "#fff",
  });

  assert.deepEqual(extracted, {
    "text.inverse": "#FFFFFF",
    "text.primary": "#1F2937",
  });
});

test("extracts token colors from nested variable objects", () => {
  const extracted = extractDesignSystemColorsFromVariableDefs({
    variables: [
      {
        name: "text.muted",
        resolvedValue: {
          r: 0.611,
          g: 0.639,
          b: 0.686,
          a: 1,
        },
      },
      {
        name: "border.default",
        value: "#CBD5E1",
      },
    ],
  });

  assert.equal(extracted["text.muted"], "#9CA3AF");
  assert.equal(extracted["border.default"], "#CBD5E1");
});

test("extracts token colors from plain text payloads", () => {
  const extracted = extractDesignSystemColorsFromVariableDefs(
    "{'icon/default/secondary': #949494, 'text/link': #2563EB}",
  );

  assert.equal(extracted["icon/default/secondary"], "#949494");
  assert.equal(extracted["text/link"], "#2563EB");
});
