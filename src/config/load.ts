import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { AppConfig } from "../core/types.js";
import { DEFAULT_CONFIG, validateAndNormalizeConfig } from "./schema.js";

export const DEFAULT_CONFIG_PATH = ".aa-auditor.yml";

export function loadConfig(configPath?: string): { config: AppConfig; source: string } {
  const resolved = resolve(configPath ?? DEFAULT_CONFIG_PATH);

  if (!existsSync(resolved)) {
    return { config: DEFAULT_CONFIG, source: "defaults" };
  }

  const raw = readFileSync(resolved, "utf8");
  const parsed = YAML.parse(raw);
  const config = validateAndNormalizeConfig(parsed);

  return { config, source: resolved };
}
