import { createHash } from "node:crypto";

export function stableId(parts: string[]): string {
  const hash = createHash("sha1");
  hash.update(parts.join("::"));
  return hash.digest("hex").slice(0, 12);
}
