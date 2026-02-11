import type {
  FigmaTargetPayload,
  NormalizedBounds,
  NormalizedColor,
  NormalizedNode,
  NormalizedTarget,
} from "../core/types.js";
import { normalizeAlpha, to255 } from "../core/color.js";

const INTERACTIVE_TYPES = new Set([
  "BUTTON",
  "LINK",
  "INPUT",
  "TEXTBOX",
  "CHECKBOX",
  "RADIO",
  "SWITCH",
  "TOGGLE",
  "TAB",
  "MENU_ITEM",
]);

const INTERACTIVE_NAME_PATTERN =
  /button|link|input|field|checkbox|radio|switch|tab|menu|dropdown|submit|cta/i;

export function normalizeTarget(payload: FigmaTargetPayload): NormalizedTarget {
  const nodes = collectNormalizedNodes(payload);

  if (nodes.length === 0) {
    payload.warnings.push(
      "No traversable nodes were found in design context; checks may be incomplete.",
    );
  }

  return {
    figmaUrl: payload.figmaUrl,
    nodeId: payload.nodeId,
    frameName: payload.frameName,
    nodes,
    warnings: [...payload.warnings],
    contextSource: payload.contextSource ?? "design-context",
    fallbackBackgroundColor: payload.fallbackBackgroundColor,
  };
}

function collectNormalizedNodes(payload: FigmaTargetPayload): NormalizedNode[] {
  const rawNodes: NormalizedNode[] = [];

  const primarySource =
    objectOrUndefined(payload.designContext)?.document ??
    objectOrUndefined(payload.designContext)?.node ??
    payload.designContext;

  if (typeof primarySource === "string") {
    rawNodes.push(...parseXmlMetadataNodes(primarySource));
  } else {
    walkMaybeNode(primarySource, rawNodes, undefined);
  }

  for (const expansion of payload.expandedDesignContexts ?? []) {
    const expansionSource =
      objectOrUndefined(expansion.context)?.document ??
      objectOrUndefined(expansion.context)?.node ??
      expansion.context;

    if (typeof expansionSource === "string") {
      rawNodes.push(...parseXmlMetadataNodes(expansionSource, payload.nodeId));
      continue;
    }

    walkMaybeNode(expansionSource, rawNodes, payload.nodeId);
  }

  return applyNodeStyleHints(
    mergeNodesById(rawNodes),
    payload.nodeStyleHints,
  );
}

function parseXmlMetadataNodes(
  xml: string,
  fallbackParentId?: string,
): NormalizedNode[] {
  const nodes: NormalizedNode[] = [];
  const stack: Array<{
    id?: string;
    hidden: boolean;
    zeroOpacity: boolean;
  }> = [];
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const full = match[0];
    const tagName = match[1];
    const attrBlock = match[2] ?? "";

    if (full.startsWith("</")) {
      stack.pop();
      continue;
    }

    const attrs = parseXmlAttributes(attrBlock);
    const inheritedHidden = stack.some((entry) => entry.hidden);
    const inheritedZeroOpacity = stack.some((entry) => entry.zeroOpacity);
    const hidden = inheritedHidden || attrs.hidden === "true" || attrs.visible === "false";
    const zeroOpacity =
      inheritedZeroOpacity || (parseFiniteNumber(attrs.opacity) ?? 1) <= 0;

    const id = attrs.id;
    if (id && !hidden && !zeroOpacity) {
      const parentId = nearestParentId(stack) ?? fallbackParentId;
      const name = attrs.name ?? tagName;
      const type = tagName.replace(/-/g, "_").toUpperCase();

      const x = parseFiniteNumber(attrs.x);
      const y = parseFiniteNumber(attrs.y);
      const width = parseFiniteNumber(attrs.width);
      const height = parseFiniteNumber(attrs.height);

      const bounds =
        x !== undefined && y !== undefined && width !== undefined && height !== undefined
          ? { x, y, width, height }
          : undefined;

      nodes.push({
        id,
        name,
        type,
        parentId,
        bounds,
        fills: [],
        strokes: [],
        text: type === "TEXT" ? name : undefined,
        isInteractive: isInteractiveXmlNode(type, name),
      });
    }

    if (!full.endsWith("/>")) {
      stack.push({
        id: id && !hidden && !zeroOpacity ? id : undefined,
        hidden,
        zeroOpacity,
      });
    }
  }

  return nodes;
}

function mergeNodesById(nodes: NormalizedNode[]): NormalizedNode[] {
  const merged = new Map<string, NormalizedNode>();

  for (const node of nodes) {
    const existing = merged.get(node.id);
    if (!existing) {
      merged.set(node.id, node);
      continue;
    }

    merged.set(node.id, {
      ...existing,
      name: richerString(existing.name, node.name) ?? existing.name,
      type: richerString(existing.type, node.type) ?? existing.type,
      parentId: existing.parentId ?? node.parentId,
      bounds: existing.bounds ?? node.bounds,
      fills: node.fills.length > 0 ? node.fills : existing.fills,
      strokes: node.strokes.length > 0 ? node.strokes : existing.strokes,
      text: node.text ?? existing.text,
      fontSize: existing.fontSize ?? node.fontSize,
      fontWeight: existing.fontWeight ?? node.fontWeight,
      lineHeightPx: existing.lineHeightPx ?? node.lineHeightPx,
      isInteractive: existing.isInteractive || node.isInteractive,
    });
  }

  return [...merged.values()];
}

function applyNodeStyleHints(
  nodes: NormalizedNode[],
  hints: FigmaTargetPayload["nodeStyleHints"],
): NormalizedNode[] {
  if (!hints || Object.keys(hints).length === 0) {
    return nodes;
  }

  return nodes.map((node) => {
    const hint = hints[node.id];
    if (!hint) {
      return node;
    }

    const textLike = node.type.toUpperCase() === "TEXT" || typeof node.text === "string";
    const hintedFillColors =
      textLike && hint.textFills.length > 0 ? hint.textFills : hint.fills;

    return {
      ...node,
      fills: node.fills.length > 0 ? node.fills : hintedFillColors,
      strokes: node.strokes.length > 0 ? node.strokes : hint.strokes,
    };
  });
}

function richerString(a?: string, b?: string): string | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return b.length > a.length ? b : a;
}

function nearestParentId(
  stack: Array<{
    id?: string;
  }>,
): string | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const id = stack[i].id;
    if (id) {
      return id;
    }
  }
  return undefined;
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isInteractiveXmlNode(type: string, name: string): boolean {
  if (INTERACTIVE_TYPES.has(type)) {
    return true;
  }

  if (/INSTANCE|BUTTON|LINK|INPUT|ICON|CHECKBOX|RADIO|SWITCH|TAB/.test(type)) {
    return true;
  }

  return INTERACTIVE_NAME_PATTERN.test(name);
}

function walkMaybeNode(
  value: unknown,
  out: NormalizedNode[],
  parentId: string | undefined,
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  const obj = value as Record<string, unknown>;
  if (isNodeHidden(obj) || hasZeroOpacity(obj)) {
    return;
  }

  const node = normalizeNode(obj, parentId);
  const currentParent = node?.id ?? parentId;

  if (node) {
    out.push(node);
  }

  const children = Array.isArray(obj.children)
    ? obj.children
    : Array.isArray(obj.nodes)
      ? obj.nodes
      : [];

  for (const child of children) {
    walkMaybeNode(child, out, currentParent);
  }
}

function normalizeNode(
  obj: Record<string, unknown>,
  parentId: string | undefined,
): NormalizedNode | undefined {
  const id = readString(obj.id) ?? readString(obj.nodeId);
  const type = readString(obj.type);

  if (!id || !type) {
    return undefined;
  }

  const name = readString(obj.name) ?? type;
  const text = readString(obj.characters) ?? readString(obj.text);

  const style = objectOrUndefined(obj.style);

  const fontSize =
    readNumber(obj.fontSize) ?? readNumber(style?.fontSize) ?? undefined;
  const fontWeight =
    readNumber(obj.fontWeight) ?? readNumber(style?.fontWeight) ?? undefined;
  const lineHeightPx =
    readNumber(obj.lineHeightPx) ?? readNumber(style?.lineHeightPx) ?? undefined;

  const bounds = parseBounds(obj);
  const fills = parsePaintList(obj.fills);
  const strokes = parsePaintList(obj.strokes);

  return {
    id,
    name,
    type,
    parentId,
    bounds,
    fills,
    strokes,
    text,
    fontSize,
    fontWeight,
    lineHeightPx,
    isInteractive: isInteractiveNode(obj, type, name),
  };
}

function isInteractiveNode(
  obj: Record<string, unknown>,
  type: string,
  name: string,
): boolean {
  if (INTERACTIVE_TYPES.has(type.toUpperCase())) {
    return true;
  }

  if (INTERACTIVE_NAME_PATTERN.test(name)) {
    return true;
  }

  const reactions = obj.reactions;
  if (Array.isArray(reactions) && reactions.length > 0) {
    return true;
  }

  if (typeof obj.onClick === "function") {
    return true;
  }

  const role = readString(obj.role);
  if (role && /button|link|checkbox|tab|menuitem|switch|textbox/i.test(role)) {
    return true;
  }

  return false;
}

function isNodeHidden(obj: Record<string, unknown>): boolean {
  return obj.visible === false || obj.hidden === true;
}

function hasZeroOpacity(obj: Record<string, unknown>): boolean {
  const style = objectOrUndefined(obj.style);
  const opacity = readNumber(obj.opacity) ?? readNumber(style?.opacity);
  return opacity !== undefined && opacity <= 0;
}

function parseBounds(obj: Record<string, unknown>): NormalizedBounds | undefined {
  const absoluteBoundingBox = objectOrUndefined(obj.absoluteBoundingBox);
  const absoluteRenderBounds = objectOrUndefined(obj.absoluteRenderBounds);
  const boundsLike = absoluteBoundingBox ?? absoluteRenderBounds ?? objectOrUndefined(obj.bounds);

  if (boundsLike) {
    const x = readNumber(boundsLike.x);
    const y = readNumber(boundsLike.y);
    const width = readNumber(boundsLike.width);
    const height = readNumber(boundsLike.height);
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      return { x, y, width, height };
    }
  }

  const size = objectOrUndefined(obj.size);
  const position = objectOrUndefined(obj.position);
  if (size && position) {
    const x = readNumber(position.x);
    const y = readNumber(position.y);
    const width = readNumber(size.width);
    const height = readNumber(size.height);
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      return { x, y, width, height };
    }
  }

  return undefined;
}

function parsePaintList(value: unknown): NormalizedColor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const colors: NormalizedColor[] = [];

  for (const paint of value) {
    if (!paint || typeof paint !== "object") {
      continue;
    }
    const paintObj = paint as Record<string, unknown>;
    if (paintObj.visible === false) {
      continue;
    }

    const paintColor = parseColor(objectOrUndefined(paintObj.color), readNumber(paintObj.opacity));
    if (paintColor) {
      colors.push(paintColor);
    }
  }

  return colors;
}

function parseColor(
  colorObj: Record<string, unknown> | undefined,
  opacity: number | undefined,
): NormalizedColor | undefined {
  if (!colorObj) {
    return undefined;
  }

  const r = readNumber(colorObj.r);
  const g = readNumber(colorObj.g);
  const b = readNumber(colorObj.b);
  const a = readNumber(colorObj.a) ?? opacity;

  if (r === undefined || g === undefined || b === undefined) {
    return undefined;
  }

  return {
    r: to255(r),
    g: to255(g),
    b: to255(b),
    a: normalizeAlpha(a),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
