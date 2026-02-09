import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditReport } from "../core/types.js";

export async function writeJsonReport(
  outDir: string,
  report: AuditReport,
): Promise<string> {
  await mkdir(outDir, { recursive: true });

  const outputPath = join(outDir, "audit-report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  return outputPath;
}
