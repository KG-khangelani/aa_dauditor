import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAudit } from "../src/core/auditRunner.js";
import type { FigmaClient, FigmaTargetPayload } from "../src/core/types.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";

const violatingFixture = JSON.parse(
  readFileSync(join(process.cwd(), "test/fixtures/design-context-violations.json"), "utf8"),
) as unknown;

const cleanFixture = JSON.parse(
  readFileSync(join(process.cwd(), "test/fixtures/design-context-clean.json"), "utf8"),
) as unknown;

class MockFigmaClient implements FigmaClient {
  constructor(private readonly byNodeId: Record<string, unknown>) {}

  async fetchTarget(figmaUrl: string): Promise<FigmaTargetPayload> {
    const url = new URL(figmaUrl);
    const nodeId = decodeURIComponent(url.searchParams.get("node-id") ?? "").replace(/-/g, ":");
    const fixture = this.byNodeId[nodeId];
    if (!fixture) {
      throw new Error(`No fixture for node ${nodeId}`);
    }

    return {
      figmaUrl,
      nodeId,
      frameName: nodeId === "1:2" ? "Checkout Form" : "Accessible Form",
      designContext: fixture,
      warnings: [],
      screenshot: {
        sourceUrl: "https://cdn.example.com/figma-shot.png",
      },
    };
  }
}

class FailingFigmaClient implements FigmaClient {
  async fetchTarget(): Promise<FigmaTargetPayload> {
    throw new Error("Synthetic fetch failure");
  }
}

test("integration: deterministic report, html content, and fail gate", async () => {
  const outDir1 = await mkdtemp(join(tmpdir(), "aa-auditor-1-"));
  const outDir2 = await mkdtemp(join(tmpdir(), "aa-auditor-2-"));

  const client = new MockFigmaClient({
    "1:2": violatingFixture,
  });

  const now = () => new Date("2026-02-09T12:00:00.000Z");
  const deps = {
    figmaClient: client,
    now,
    runIdFactory: () => "run-fixed-1",
  };

  try {
    const run1 = await runAudit(
      {
        targets: [{ figmaUrl: "https://www.figma.com/file/demo/checkout?node-id=1-2" }],
        outDir: outDir1,
        config: DEFAULT_CONFIG,
        reportFormat: "both",
        failOn: ["blocker", "critical"],
      },
      deps,
    );

    const run2 = await runAudit(
      {
        targets: [{ figmaUrl: "https://www.figma.com/file/demo/checkout?node-id=1-2" }],
        outDir: outDir2,
        config: DEFAULT_CONFIG,
        reportFormat: "both",
        failOn: ["blocker", "critical"],
      },
      deps,
    );

    const reportJson1 = JSON.parse(await readFile(run1.jsonPath!, "utf8"));
    const reportJson2 = JSON.parse(await readFile(run2.jsonPath!, "utf8"));

    assert.deepEqual(reportJson1, reportJson2);
    assert.equal(run1.shouldFail, true);

    const html = await readFile(run1.htmlPath!, "utf8");
    assert.match(html, /Summary/);
    assert.match(html, /Manual Checklist/);
    assert.match(html, /cdn\.example\.com\/figma-shot\.png/);
  } finally {
    await rm(outDir1, { recursive: true, force: true });
    await rm(outDir2, { recursive: true, force: true });
  }
});

test("integration: multi-target aggregation", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "aa-auditor-multi-"));

  const client = new MockFigmaClient({
    "1:2": violatingFixture,
    "10:2": cleanFixture,
  });

  try {
    const result = await runAudit(
      {
        targets: [
          { figmaUrl: "https://www.figma.com/file/demo/checkout?node-id=1-2" },
          { figmaUrl: "https://www.figma.com/file/demo/clean?node-id=10-2" },
        ],
        outDir,
        config: DEFAULT_CONFIG,
        reportFormat: "json",
        failOn: ["blocker", "critical"],
      },
      {
        figmaClient: client,
        now: () => new Date("2026-02-09T12:00:00.000Z"),
        runIdFactory: () => "run-fixed-2",
      },
    );

    assert.equal(result.report.targets.length, 2);
    assert.equal(result.report.summary.totalTargets, 2);
    assert.ok(
      result.report.targets.every((target) => target.screenshotPath === "https://cdn.example.com/figma-shot.png"),
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("integration: fetch failures still produce target manual checklist entries", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "aa-auditor-fail-"));

  try {
    const result = await runAudit(
      {
        targets: [{ figmaUrl: "https://www.figma.com/file/demo/checkout?node-id=1-2" }],
        outDir,
        config: DEFAULT_CONFIG,
        reportFormat: "json",
        failOn: ["blocker", "critical"],
      },
      {
        figmaClient: new FailingFigmaClient(),
        now: () => new Date("2026-02-09T12:00:00.000Z"),
        runIdFactory: () => "run-fixed-3",
      },
    );

    assert.equal(result.report.targets.length, 1);
    assert.equal(result.report.manualChecks.length, 5);
    assert.match(result.report.targets[0].warnings[0], /Fetch\/audit fallback engaged/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
