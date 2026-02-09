import test from "node:test";
import assert from "node:assert/strict";
import { validateAndNormalizeConfig } from "../src/config/schema.js";

test("config applies defaults and validates shape", () => {
  const config = validateAndNormalizeConfig({});

  assert.equal(config.wcagVersion, "2.2");
  assert.equal(config.level, "AA");
  assert.deepEqual(config.failOn, ["blocker", "critical"]);
  assert.equal(config.report.includeScreenshots, true);
  assert.deepEqual(config.report.formats, ["json", "html"]);
  assert.equal(config.rules["WCAG-2.5.8-target-size-minimum"].enabled, true);
});

test("config rejects invalid severity", () => {
  assert.throws(
    () =>
      validateAndNormalizeConfig({
        failOn: ["sev0"],
      }),
    /must be one of/,
  );
});
