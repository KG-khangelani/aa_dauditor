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

interface BoundsContext {
  accumulatedBoundsById: Map<string, { x: number; y: number; width: number; height: number }>;
  allowAccumulatedCoverage: boolean;
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
  const boundsContext = buildBoundsContext(target, map);
  const childrenByParent = buildChildrenByParent(target);
  const overlays: Array<{
    color: NormalizedColor;
    path: string;
  }> = [];
  let skippedByCoverage = 0;
  const visited = new Set<string>();
  let current: NormalizedNode | undefined = node;

  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = map.get(current.parentId);
    if (!parent) {
      break;
    }

    const siblingOverlay = resolveSiblingOverlay(
      target,
      current,
      node,
      childrenByParent,
      boundsContext,
    );
    if (siblingOverlay) {
      overlays.push(siblingOverlay);
    }

    const backgroundFill = isTextualNode(parent) ? undefined : firstVisibleColor(parent.fills);
    if (!backgroundFill) {
      current = parent;
      continue;
    }

    if (!boundsCover(parent, node, boundsContext)) {
      skippedByCoverage += 1;
      current = parent;
      continue;
    }

    overlays.push({
      color: backgroundFill,
      path: layerPathForNode(target, parent),
    });
    current = parent;
  }

  if (overlays.length === 0) {
    if (target.fallbackBackgroundColor) {
      return {
        color: target.fallbackBackgroundColor,
        sourceLayerPath: "[design-context-fallback] document background",
      };
    }
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

function firstVisibleColor(colors: NormalizedColor[]): NormalizedColor | undefined {
  return colors.find((color) => color.a > 0.001);
}

function buildChildrenByParent(
  target: NormalizedTarget,
): Map<string, NormalizedNode[]> {
  const byParent = new Map<string, NormalizedNode[]>();

  for (const candidate of target.nodes) {
    if (!candidate.parentId) {
      continue;
    }
    const list = byParent.get(candidate.parentId) ?? [];
    list.push(candidate);
    byParent.set(candidate.parentId, list);
  }

  return byParent;
}

function resolveSiblingOverlay(
  target: NormalizedTarget,
  current: NormalizedNode,
  subject: NormalizedNode,
  childrenByParent: Map<string, NormalizedNode[]>,
  boundsContext: BoundsContext,
):
  | {
      color: NormalizedColor;
      path: string;
    }
  | undefined {
  if (!current.parentId) {
    return undefined;
  }

  const siblings = childrenByParent.get(current.parentId);
  if (!siblings || siblings.length === 0) {
    return undefined;
  }

  const currentIndex = siblings.findIndex((candidate) => candidate.id === current.id);
  if (currentIndex <= 0) {
    return undefined;
  }

  // In Figma node arrays, earlier siblings are typically behind later siblings.
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const candidate = siblings[i];
    const resolved = resolveCoveringFillInSubtree(
      candidate,
      subject,
      childrenByParent,
      boundsContext,
    );
    if (resolved) {
      return {
        color: resolved.color,
        path: layerPathForNode(target, resolved.sourceNode),
      };
    }
  }

  return undefined;
}

function resolveCoveringFillInSubtree(
  root: NormalizedNode,
  subject: NormalizedNode,
  childrenByParent: Map<string, NormalizedNode[]>,
  boundsContext: BoundsContext,
):
  | {
      color: NormalizedColor;
      sourceNode: NormalizedNode;
    }
  | undefined {
  return resolveCoveringFillInNode(root, subject, childrenByParent, boundsContext);
}

function resolveCoveringFillInNode(
  current: NormalizedNode,
  subject: NormalizedNode,
  childrenByParent: Map<string, NormalizedNode[]>,
  boundsContext: BoundsContext,
):
  | {
      color: NormalizedColor;
      sourceNode: NormalizedNode;
    }
  | undefined {
  if (!boundsCover(current, subject, boundsContext)) {
    return undefined;
  }

  const children = childrenByParent.get(current.id);
  if (children) {
    // Later siblings are usually top-most in Figma painting order.
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      const resolved = resolveCoveringFillInNode(
        child,
        subject,
        childrenByParent,
        boundsContext,
      );
      if (resolved) {
        return resolved;
      }
    }
  }

  const fill = isTextualNode(current) ? undefined : firstVisibleColor(current.fills);
  if (fill) {
    return {
      color: fill,
      sourceNode: current,
    };
  }

  return undefined;
}

function isTextualNode(node: NormalizedNode): boolean {
  return node.type.toUpperCase() === "TEXT" || typeof node.text === "string";
}

function boundsCover(
  backgroundNode: NormalizedNode,
  node: NormalizedNode,
  boundsContext: BoundsContext,
): boolean {
  if (!backgroundNode.bounds || !node.bounds) {
    return true;
  }

  if (rectCovers(backgroundNode.bounds, node.bounds)) {
    return true;
  }

  if (!boundsContext.allowAccumulatedCoverage) {
    return false;
  }

  const backgroundAccumulated = boundsContext.accumulatedBoundsById.get(backgroundNode.id);
  const nodeAccumulated = boundsContext.accumulatedBoundsById.get(node.id);

  if (!backgroundAccumulated || !nodeAccumulated) {
    return false;
  }

  return rectCovers(backgroundAccumulated, nodeAccumulated);
}

function rectCovers(
  backgroundBounds: { x: number; y: number; width: number; height: number },
  nodeBounds: { x: number; y: number; width: number; height: number },
): boolean {
  const epsilon = 0.25;

  const bx1 = backgroundBounds.x;
  const by1 = backgroundBounds.y;
  const bx2 = backgroundBounds.x + backgroundBounds.width;
  const by2 = backgroundBounds.y + backgroundBounds.height;

  const nx1 = nodeBounds.x;
  const ny1 = nodeBounds.y;
  const nx2 = nodeBounds.x + nodeBounds.width;
  const ny2 = nodeBounds.y + nodeBounds.height;

  return (
    bx1 <= nx1 + epsilon &&
    by1 <= ny1 + epsilon &&
    bx2 >= nx2 - epsilon &&
    by2 >= ny2 - epsilon
  );
}

function buildBoundsContext(
  target: NormalizedTarget,
  map: Map<string, NormalizedNode>,
): BoundsContext {
  const accumulatedBoundsById = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  const visiting = new Set<string>();

  const resolveAccumulated = (
    current: NormalizedNode,
  ): { x: number; y: number; width: number; height: number } | undefined => {
    if (accumulatedBoundsById.has(current.id)) {
      return accumulatedBoundsById.get(current.id);
    }

    if (!current.bounds || visiting.has(current.id)) {
      return current.bounds;
    }

    visiting.add(current.id);
    const parent = current.parentId ? map.get(current.parentId) : undefined;
    const parentAccumulated = parent ? resolveAccumulated(parent) : undefined;
    visiting.delete(current.id);

    const resolved = parentAccumulated
      ? {
          x: parentAccumulated.x + current.bounds.x,
          y: parentAccumulated.y + current.bounds.y,
          width: current.bounds.width,
          height: current.bounds.height,
        }
      : current.bounds;

    accumulatedBoundsById.set(current.id, resolved);
    return resolved;
  };

  for (const node of target.nodes) {
    resolveAccumulated(node);
  }

  return {
    accumulatedBoundsById,
    allowAccumulatedCoverage: target.contextSource === "metadata-fallback",
  };
}
