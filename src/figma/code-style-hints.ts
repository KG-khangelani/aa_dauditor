import type { NormalizedColor } from "../core/types.js";

export interface NodeStyleHint {
  fills: NormalizedColor[];
  textFills: NormalizedColor[];
  strokes: NormalizedColor[];
}

export function extractNodeStyleHintsFromCode(
  payload: string,
  designSystemColors?: Record<string, string>,
): Record<string, NodeStyleHint> {
  const hints = new Map<string, NodeStyleHint>();
  const tagRegex = /<[^>]*data-node-id="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(payload)) !== null) {
    const nodeId = match[1];
    const tag = match[0];
    const className = readClassName(tag);
    if (!className) {
      continue;
    }

    for (const color of extractColors(className, "text", designSystemColors)) {
      upsertColor(hints, nodeId, "textFills", color);
    }

    for (const color of extractColors(className, "bg", designSystemColors)) {
      upsertColor(hints, nodeId, "fills", color);
    }

    for (const color of extractColors(className, "border", designSystemColors)) {
      upsertColor(hints, nodeId, "strokes", color);
    }
  }

  return Object.fromEntries([...hints.entries()]);
}

export function extractDocumentBackgroundHintFromCode(
  payload: string,
  designSystemColors?: Record<string, string>,
): NormalizedColor | undefined {
  const tagRegex = /<[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(payload)) !== null) {
    const tag = match[0];
    const className = readClassName(tag);
    if (!className) {
      continue;
    }

    const backgroundColors = extractColors(className, "bg", designSystemColors);
    const solidBackground = backgroundColors.find((color) => color.a >= 0.999);
    if (solidBackground) {
      return solidBackground;
    }
  }

  return undefined;
}

function readClassName(tag: string): string | undefined {
  const classNameMatch = tag.match(/\bclassName=(["'])(.*?)\1/);
  if (classNameMatch?.[2]) {
    return classNameMatch[2];
  }

  const classMatch = tag.match(/\bclass=(["'])(.*?)\1/);
  if (classMatch?.[2]) {
    return classMatch[2];
  }

  return undefined;
}

function extractColors(
  className: string,
  kind: "text" | "bg" | "border",
  designSystemColors?: Record<string, string>,
): NormalizedColor[] {
  const out: NormalizedColor[] = [];
  const seen = new Set<string>();

  const varRegex = new RegExp(`${kind}-\\[color:var\\(([^\\)]*)\\)\\]`, "g");
  const directRegex = new RegExp(`${kind}-\\[(#[0-9A-Fa-f]{3,8})\\]`, "g");

  collectVarMatches(className, varRegex, designSystemColors, seen, out);
  collectHexMatches(className, directRegex, seen, out);

  return out;
}

function collectVarMatches(
  input: string,
  regex: RegExp,
  designSystemColors: Record<string, string> | undefined,
  seen: Set<string>,
  out: NormalizedColor[],
): void {
  const normalizedColors = normalizeDesignSystemColors(designSystemColors);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const inside = match[1]?.trim();
    if (!inside) {
      continue;
    }

    const parts = inside.split(",").map((part) => part.trim());
    const varName = parts[0];
    const fallbackHex = parts.find((part) => /^#[0-9A-Fa-f]{3,8}$/.test(part));
    const resolvedHex =
      fallbackHex ??
      resolveCssVarColor(varName, normalizedColors) ??
      undefined;

    if (!resolvedHex) {
      continue;
    }

    const hex = normalizeHex(resolvedHex);
    if (!isHexColor(hex) || seen.has(hex)) {
      continue;
    }

    const parsed = parseHexColor(hex);
    if (!parsed) {
      continue;
    }

    seen.add(hex);
    out.push(parsed);
  }
}

function collectHexMatches(
  input: string,
  regex: RegExp,
  seen: Set<string>,
  out: NormalizedColor[],
): void {
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const hex = normalizeHex(match[1]);
    if (!isHexColor(hex) || seen.has(hex)) {
      continue;
    }
    const parsed = parseHexColor(hex);
    if (!parsed) {
      continue;
    }
    seen.add(hex);
    out.push(parsed);
  }
}

function upsertColor(
  map: Map<string, NodeStyleHint>,
  nodeId: string,
  field: "fills" | "textFills" | "strokes",
  color: NormalizedColor,
): void {
  const existing = map.get(nodeId) ?? { fills: [], textFills: [], strokes: [] };
  existing[field].push(color);
  map.set(nodeId, existing);
}

function normalizeDesignSystemColors(
  colors: Record<string, string> | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!colors) {
    return out;
  }

  for (const [token, hex] of Object.entries(colors)) {
    out.set(normalizeTokenKey(token), hex);
  }

  return out;
}

function resolveCssVarColor(
  varName: string,
  normalizedColors: Map<string, string>,
): string | undefined {
  const cleaned = varName.replace(/^--/, "").replaceAll("\\/", "/");
  const normalized = normalizeTokenKey(cleaned);
  return normalizedColors.get(normalized);
}

function normalizeTokenKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replaceAll("\\/", "/")
    .replaceAll(/\s+/g, "")
    .replaceAll("_", "/")
    .replaceAll("-", "-");
}

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{4}$/.test(trimmed)) {
    const [, r, g, b, a] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}${a}${a}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(value);
}

function parseHexColor(value: string): NormalizedColor | undefined {
  if (!isHexColor(value)) {
    return undefined;
  }

  const raw = value.slice(1);
  if (raw.length === 6) {
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }

  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
    a: Number.parseInt(raw.slice(6, 8), 16) / 255,
  };
}
