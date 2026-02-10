import { contrastRatio } from "../core/color.js";
import type { NormalizedColor } from "../core/types.js";

interface Candidate {
  token: string;
  hex: string;
  color: NormalizedColor;
  ratio: number;
  distance: number;
}

interface TokenColor {
  token: string;
  hex: string;
  color: NormalizedColor;
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

  const tokenColors = parseTokenColors(designSystemColors);
  if (tokenColors.length === 0) {
    return undefined;
  }

  const fgCandidates = findForegroundCandidates(
    tokenColors,
    foreground,
    background,
    threshold,
  );
  const bestForeground = fgCandidates[0];
  const bestBackground = findBestBackgroundReplacement(
    tokenColors,
    foreground,
    background,
    threshold,
  );
  const bestPair = findBestTokenPair(
    tokenColors,
    foreground,
    background,
    threshold,
  );

  if (!bestForeground && !bestBackground && !bestPair) {
    return `No design-system color token meets ${threshold.toFixed(
      1,
    )}:1 contrast for this foreground/background combination.`;
  }

  const parts: string[] = [];

  if (bestForeground) {
    parts.push(
      [
        "Fix A (replace foreground variable):",
        `${bestForeground.token} (${bestForeground.hex})`,
        `-> ${bestForeground.ratio.toFixed(2)}:1`,
      ].join(" "),
    );
  }

  if (bestBackground) {
    parts.push(
      [
        "Fix B (replace background variable):",
        `${bestBackground.token} (${bestBackground.hex})`,
        `-> ${bestBackground.ratio.toFixed(2)}:1`,
      ].join(" "),
    );
  }

  if (bestPair) {
    parts.push(
      [
        "Fix C (replace both with variables):",
        `fg ${bestPair.foreground.token} (${bestPair.foreground.hex}) +`,
        `bg ${bestPair.background.token} (${bestPair.background.hex})`,
        `-> ${bestPair.ratio.toFixed(2)}:1`,
      ].join(" "),
    );
  }

  const alternatives = fgCandidates
    .slice(0, 3)
    .map((entry) => `${entry.token} (${entry.hex}, ${entry.ratio.toFixed(2)}:1)`)
    .join("; ");

  if (alternatives) {
    parts.push(`Other passing foreground variables: ${alternatives}.`);
  }

  return `Variable-aware fix suggestions: ${parts.join(" ")}`;
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

function parseTokenColors(
  designSystemColors: Record<string, string>,
): TokenColor[] {
  const out: TokenColor[] = [];
  for (const [token, hexInput] of Object.entries(designSystemColors)) {
    const parsed = parseHexColor(hexInput);
    if (!parsed) {
      continue;
    }
    out.push({
      token,
      hex: normalizeHex(hexInput),
      color: parsed,
    });
  }
  return out;
}

function findForegroundCandidates(
  tokenColors: TokenColor[],
  foreground: NormalizedColor,
  background: NormalizedColor,
  threshold: number,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const tokenColor of tokenColors) {
    const ratio = contrastRatio(tokenColor.color, background);
    if (ratio < threshold) {
      continue;
    }

    candidates.push({
      token: tokenColor.token,
      hex: tokenColor.hex,
      color: tokenColor.color,
      ratio,
      distance: rgbDistance(tokenColor.color, foreground),
    });
  }

  candidates.sort((a, b) => {
    const distanceDiff = a.distance - b.distance;
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    return b.ratio - a.ratio;
  });

  return candidates;
}

function findBestBackgroundReplacement(
  tokenColors: TokenColor[],
  foreground: NormalizedColor,
  background: NormalizedColor,
  threshold: number,
): Candidate | undefined {
  const candidates: Candidate[] = [];

  for (const tokenColor of tokenColors) {
    // Only recommend fully opaque background swaps for deterministic contrast.
    if (tokenColor.color.a < 1) {
      continue;
    }

    const ratio = contrastRatio(foreground, tokenColor.color);
    if (ratio < threshold) {
      continue;
    }

    candidates.push({
      token: tokenColor.token,
      hex: tokenColor.hex,
      color: tokenColor.color,
      ratio,
      distance: rgbDistance(tokenColor.color, background),
    });
  }

  candidates.sort((a, b) => {
    const distanceDiff = a.distance - b.distance;
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    return b.ratio - a.ratio;
  });

  return candidates[0];
}

function findBestTokenPair(
  tokenColors: TokenColor[],
  foreground: NormalizedColor,
  background: NormalizedColor,
  threshold: number,
):
  | {
      foreground: TokenColor;
      background: TokenColor;
      ratio: number;
      distance: number;
    }
  | undefined {
  let best:
    | {
        foreground: TokenColor;
        background: TokenColor;
        ratio: number;
        distance: number;
      }
    | undefined;

  for (const fgToken of tokenColors) {
    for (const bgToken of tokenColors) {
      // Keep pair guidance deterministic by requiring an opaque background.
      if (bgToken.color.a < 1) {
        continue;
      }

      const ratio = contrastRatio(fgToken.color, bgToken.color);
      if (ratio < threshold) {
        continue;
      }

      const distance =
        rgbDistance(fgToken.color, foreground) + rgbDistance(bgToken.color, background);

      if (!best || distance < best.distance || (distance === best.distance && ratio > best.ratio)) {
        best = {
          foreground: fgToken,
          background: bgToken,
          ratio,
          distance,
        };
      }
    }
  }

  return best;
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
