interface RgbaLike {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export function extractDesignSystemColorsFromVariableDefs(
  payload: unknown,
): Record<string, string> {
  const out = new Map<string, string>();
  collectColors(payload, out, []);

  const ordered = [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(ordered);
}

function collectColors(
  value: unknown,
  out: Map<string, string>,
  path: string[],
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    collectFromText(value, out);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectColors(item, out, path);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const obj = value as Record<string, unknown>;

  const tokenName =
    readString(obj.name) ??
    readString(obj.variableName) ??
    readString(obj.token) ??
    readString(obj.slug);

  const valueCandidate =
    readString(obj.value) ??
    readString(obj.resolvedValue) ??
    readString(obj.hex) ??
    undefined;

  if (tokenName && valueCandidate && isHexColor(valueCandidate)) {
    setColorToken(out, tokenName, valueCandidate);
  }

  const colorCandidate =
    asRgbaObject(obj.value) ??
    asRgbaObject(obj.resolvedValue) ??
    asRgbaObject(obj.color) ??
    asRgbaObject(obj.resolvedColor);

  if (tokenName && colorCandidate) {
    setColorToken(out, tokenName, rgbaToHex(colorCandidate));
  }

  for (const [key, nested] of Object.entries(obj)) {
    if (typeof nested === "string" && isHexColor(nested)) {
      setColorToken(out, tokenForPath(path, key), nested);
      continue;
    }

    const nestedColor = asRgbaObject(nested);
    if (nestedColor) {
      setColorToken(out, tokenForPath(path, key), rgbaToHex(nestedColor));
      continue;
    }

    collectColors(nested, out, [...path, key]);
  }
}

function collectFromText(text: string, out: Map<string, string>): void {
  const pairRegex = /["']?([A-Za-z0-9._\/-][A-Za-z0-9._\/-\s]*?)["']?\s*[:=]\s*(#[0-9A-Fa-f]{3,8})/g;
  let match: RegExpExecArray | null;

  while ((match = pairRegex.exec(text)) !== null) {
    const token = match[1].trim();
    const color = match[2].trim();
    if (token && isHexColor(color)) {
      setColorToken(out, token, color);
    }
  }
}

function setColorToken(out: Map<string, string>, token: string, color: string): void {
  const normalizedToken = token.trim();
  if (!isLikelyTokenName(normalizedToken)) {
    return;
  }
  out.set(normalizedToken, normalizeHex(color));
}

function tokenForPath(path: string[], key: string): string {
  if (path.length === 0) {
    return key;
  }

  const last = path[path.length - 1];
  if (last === "values" || last === "variables" || last === "tokens") {
    return key;
  }

  return `${last}.${key}`;
}

function asRgbaObject(value: unknown): RgbaLike | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const r = readNumber(obj.r);
  const g = readNumber(obj.g);
  const b = readNumber(obj.b);

  if (r === undefined || g === undefined || b === undefined) {
    return undefined;
  }

  return {
    r,
    g,
    b,
    a: readNumber(obj.a) ?? readNumber(obj.opacity),
  };
}

function rgbaToHex(rgba: RgbaLike): string {
  const r = toByte(rgba.r);
  const g = toByte(rgba.g);
  const b = toByte(rgba.b);
  const a = rgba.a === undefined ? 255 : toAlphaByte(rgba.a);

  if (a === 255) {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }

  return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

function toByte(value: number): number {
  if (value <= 1) {
    return clamp(Math.round(value * 255), 0, 255);
  }
  return clamp(Math.round(value), 0, 255);
}

function toAlphaByte(value: number): number {
  if (value <= 1) {
    return clamp(Math.round(value * 255), 0, 255);
  }
  return clamp(Math.round(value), 0, 255);
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
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
  const normalized = normalizeHex(value);
  return /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(normalized);
}

function isLikelyTokenName(token: string): boolean {
  if (!token) {
    return false;
  }
  if (isHexColor(token)) {
    return false;
  }
  return /[A-Za-z]/.test(token) || token.includes("/") || token.includes(".");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
