import type {
  NormalizedColor,
  NormalizedNode,
  NormalizedTarget,
} from "../core/types.js";
import { flattenAlpha } from "../core/color.js";

export interface BackgroundResolution {
  color?: NormalizedColor;
  sourceLayerPath?: string;
  reason?: string;
}

export function firstFill(node: NormalizedNode): NormalizedColor | undefined {
  return node.fills[0];
}

export function firstStroke(node: NormalizedNode): NormalizedColor | undefined {
  return node.strokes[0];
}

export function resolveEffectiveBackground(
  target: NormalizedTarget,
  node: NormalizedNode,
): BackgroundResolution {
  const map = nodeMap(target);
  const ancestors = collectAncestors(map, node);
  const overlays: Array<{
    color: NormalizedColor;
    path: string;
  }> = [];
  let skippedByCoverage = 0;

  for (const ancestor of ancestors) {
    const backgroundFill = firstVisibleColor(ancestor.fills);
    if (!backgroundFill) {
      continue;
    }

    if (!boundsCover(ancestor, node)) {
      skippedByCoverage += 1;
      continue;
    }

    overlays.push({
      color: backgroundFill,
      path: layerPathForNode(target, ancestor),
    });
  }

  if (overlays.length === 0) {
    if (skippedByCoverage > 0) {
      return {
        reason:
          "Ancestor backgrounds exist but do not fully cover this layer bounds.",
      };
    }
    return {
      reason:
        "No solid ancestor background found (transparent/image/gradient context).",
    };
  }

  let baseIndex = -1;
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    if (overlays[i].color.a >= 0.999) {
      baseIndex = i;
      break;
    }
  }

  if (baseIndex === -1) {
    return {
      reason:
        "Only translucent ancestor backgrounds found; effective backdrop remains dynamic.",
    };
  }

  let resolved = overlays[baseIndex].color;
  for (let i = baseIndex - 1; i >= 0; i -= 1) {
    resolved = flattenAlpha(overlays[i].color, resolved);
  }

  const sourceLayerPath = overlays
    .slice(0, baseIndex + 1)
    .map((entry) => entry.path)
    .join(" <= ");

  return {
    color: resolved,
    sourceLayerPath,
  };
}

export function nodeMap(target: NormalizedTarget): Map<string, NormalizedNode> {
  return new Map(target.nodes.map((node) => [node.id, node]));
}

export function layerPathForNode(
  target: NormalizedTarget,
  node: NormalizedNode,
): string {
  const map = nodeMap(target);
  const path: string[] = [];
  const seen = new Set<string>();

  let current: NormalizedNode | undefined = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }

  return path.join(" > ");
}

export function likelyTextNodes(target: NormalizedTarget): NormalizedNode[] {
  return target.nodes.filter(
    (node) => node.type.toUpperCase() === "TEXT" || typeof node.text === "string",
  );
}

export function likelyNonTextContrastNodes(
  target: NormalizedTarget,
): NormalizedNode[] {
  return target.nodes.filter((node) => {
    const hasVisual = node.fills.length > 0 || node.strokes.length > 0;
    if (!hasVisual) {
      return false;
    }

    if (node.type.toUpperCase() === "TEXT") {
      return false;
    }

    return node.isInteractive || /icon|input|button|radio|checkbox|toggle|tab/i.test(node.name);
  });
}

export function likelyInteractiveNodes(target: NormalizedTarget): NormalizedNode[] {
  return target.nodes.filter((node) => node.isInteractive);
}

function collectAncestors(
  map: Map<string, NormalizedNode>,
  node: NormalizedNode,
): NormalizedNode[] {
  const ancestors: NormalizedNode[] = [];
  const seen = new Set<string>();
  let current: NormalizedNode | undefined = node;

  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = map.get(current.parentId);
    if (!parent) {
      break;
    }
    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

function firstVisibleColor(colors: NormalizedColor[]): NormalizedColor | undefined {
  return colors.find((color) => color.a > 0.001);
}

function boundsCover(backgroundNode: NormalizedNode, node: NormalizedNode): boolean {
  if (!backgroundNode.bounds || !node.bounds) {
    return true;
  }

  const epsilon = 0.25;

  const bx1 = backgroundNode.bounds.x;
  const by1 = backgroundNode.bounds.y;
  const bx2 = backgroundNode.bounds.x + backgroundNode.bounds.width;
  const by2 = backgroundNode.bounds.y + backgroundNode.bounds.height;

  const nx1 = node.bounds.x;
  const ny1 = node.bounds.y;
  const nx2 = node.bounds.x + node.bounds.width;
  const ny2 = node.bounds.y + node.bounds.height;

  return (
    bx1 <= nx1 + epsilon &&
    by1 <= ny1 + epsilon &&
    bx2 >= nx2 - epsilon &&
    by2 >= ny2 - epsilon
  );
}
