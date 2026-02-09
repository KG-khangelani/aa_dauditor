import type { NormalizedColor } from "./types.js";

export function to255(value: number): number {
  if (value <= 1) {
    return clamp(Math.round(value * 255), 0, 255);
  }
  return clamp(Math.round(value), 0, 255);
}

export function normalizeAlpha(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (value <= 1) {
    return clamp(value, 0, 1);
  }
  return clamp(value / 255, 0, 1);
}

export function luminance(color: NormalizedColor): number {
  const channels = [color.r, color.g, color.b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: NormalizedColor, background: NormalizedColor): number {
  const fg = flattenAlpha(foreground, background);
  const bg = background;

  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export function isLargeText(fontSize?: number, fontWeight?: number): boolean {
  if (!fontSize) {
    return false;
  }
  const bold = (fontWeight ?? 400) >= 700;
  if (bold) {
    return fontSize >= 18.5;
  }
  return fontSize >= 24;
}

export function colorToString(color: NormalizedColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Number(color.a.toFixed(2))})`;
}

export function flattenAlpha(
  foreground: NormalizedColor,
  background: NormalizedColor,
): NormalizedColor {
  const a = clamp(foreground.a, 0, 1);
  if (a >= 1) {
    return foreground;
  }

  return {
    r: Math.round(foreground.r * a + background.r * (1 - a)),
    g: Math.round(foreground.g * a + background.g * (1 - a)),
    b: Math.round(foreground.b * a + background.b * (1 - a)),
    a: 1,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
