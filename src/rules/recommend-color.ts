import { contrastRatio } from "../core/color.js";
import type { NormalizedColor } from "../core/types.js";

interface Candidate {
  token: string;
  hex: string;
  color: NormalizedColor;
  ratio: number;
  distance: number;
}

export function recommendDesignSystemColorsForContrast(
  designSystemColors: Record<string, string> | undefined,
  foreground: NormalizedColor,
  background: NormalizedColor,
  threshold: number,
): string | undefined {
  if (!designSystemColors || Object.keys(designSystemColors).length === 0) {
    return undefined;
  }

  const candidates: Candidate[] = [];

  for (const [token, hexInput] of Object.entries(designSystemColors)) {
    const parsed = parseHexColor(hexInput);
    if (!parsed) {
      continue;
    }

    const ratio = contrastRatio(parsed, background);
    if (ratio < threshold) {
      continue;
    }

    candidates.push({
      token,
      hex: normalizeHex(hexInput),
      color: parsed,
      ratio,
      distance: rgbDistance(parsed, foreground),
    });
  }

  if (candidates.length === 0) {
    return `No design-system color token meets ${threshold.toFixed(
      1,
    )}:1 contrast against this background.`;
  }

  candidates.sort((a, b) => {
    const distanceDiff = a.distance - b.distance;
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    return b.ratio - a.ratio;
  });

  const top = candidates.slice(0, 3);
  const list = top
    .map((entry) => `${entry.token} (${entry.hex}, ${entry.ratio.toFixed(2)}:1)`)
    .join("; ");

  return `Suggested design-system tokens: ${list}`;
}

export function recommendTokensForManualColorReview(
  designSystemColors: Record<string, string> | undefined,
  limit = 5,
): string | undefined {
  if (!designSystemColors || Object.keys(designSystemColors).length === 0) {
    return undefined;
  }

  const entries = Object.entries(designSystemColors)
    .map(([token, hex]) => [token, normalizeHex(hex)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit);

  if (entries.length === 0) {
    return undefined;
  }

  const preview = entries.map(([token, hex]) => `${token} (${hex})`).join("; ");
  return `Contrast data unavailable. Start review using design-system variable tokens: ${preview}.`;
}

function rgbDistance(a: NormalizedColor, b: NormalizedColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function parseHexColor(value: string): NormalizedColor | undefined {
  const hex = normalizeHex(value);
  if (!/^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(hex)) {
    return undefined;
  }

  const raw = hex.slice(1);
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

export function isValidHexColor(value: string): boolean {
  const normalized = normalizeHex(value);
  return /^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(normalized);
}
