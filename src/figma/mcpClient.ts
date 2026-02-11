import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FigmaClient, FigmaTargetPayload } from "../core/types.js";
import { parseFigmaUrl } from "./url.js";
import { extractDesignSystemColorsFromVariableDefs } from "./variable-colors.js";
import {
  selectAncestorCandidatesFromMetadata,
  selectSublayerCandidatesFromMetadata,
} from "./sublayer-expansion.js";

interface JsonRpcResult {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface ToolCallResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type HealthStatus = "ok" | "warn" | "fail";

export interface FigmaMcpHealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
}

export interface FigmaMcpHealthResult {
  status: HealthStatus;
  endpoint: string;
  checks: FigmaMcpHealthCheck[];
  suggestions: string[];
}

export interface FigmaMcpClientOptions {
  endpoint: string;
  token: string;
  region: string;
  timeoutMs: number;
  sublayerExpansionLimit: number;
}

export function createFigmaClientFromEnv(): FigmaClient {
  const endpoint = process.env.FIGMA_MCP_URL ?? "https://mcp.figma.com/mcp";
  const token = process.env.FIGMA_OAUTH_TOKEN;
  const region = process.env.FIGMA_REGION ?? "us-east-1";
  const timeoutMs = Number(process.env.FIGMA_MCP_TIMEOUT_MS ?? "60000");
  const sublayerExpansionLimit = Number(process.env.FIGMA_SUBLAYER_EXPANSION_LIMIT ?? "16");

  if (!token) {
    throw new Error(
      [
        "FIGMA_OAUTH_TOKEN is not set.",
        "Set FIGMA_OAUTH_TOKEN and ensure your Codex config includes the Figma MCP server.",
      ].join(" "),
    );
  }

  return new RemoteFigmaMcpClient({
    endpoint,
    token,
    region,
    timeoutMs,
    sublayerExpansionLimit,
  });
}

export async function runFigmaMcpHealthCheck(
  figmaUrl?: string,
): Promise<FigmaMcpHealthResult> {
  const client = createFigmaClientFromEnv();

  if (!(client instanceof RemoteFigmaMcpClient)) {
    throw new Error("Health check requires the built-in RemoteFigmaMcpClient.");
  }

  return client.healthCheck(figmaUrl);
}

export class RemoteFigmaMcpClient implements FigmaClient {
  private initialized = false;

  private sessionId: string | undefined;

  private nextId = 1;

  constructor(private readonly options: FigmaMcpClientOptions) {}

  async healthCheck(figmaUrl?: string): Promise<FigmaMcpHealthResult> {
    const checks: FigmaMcpHealthCheck[] = [];
    const suggestions = new Set<string>();

    try {
      await this.initialize();
      checks.push({
        name: "mcp-initialize",
        status: "ok",
        message: "MCP initialize succeeded.",
      });
    } catch (error) {
      const diagnostic = diagnoseMcpHealthError((error as Error).message);
      checks.push({
        name: "mcp-initialize",
        status: diagnostic.status,
        message: diagnostic.summary,
      });
      for (const suggestion of diagnostic.suggestions) {
        suggestions.add(suggestion);
      }

      return {
        status: summarizeHealthStatus(checks),
        endpoint: this.options.endpoint,
        checks,
        suggestions: [...suggestions],
      };
    }

    if (!figmaUrl) {
      checks.push({
        name: "design-tools",
        status: "warn",
        message: "No --url provided; skipped design tool validation.",
      });
      suggestions.add(
        "Provide --url to validate get_metadata/get_design_context against a specific frame.",
      );
      return {
        status: summarizeHealthStatus(checks),
        endpoint: this.options.endpoint,
        checks,
        suggestions: [...suggestions],
      };
    }

    let parsed: ReturnType<typeof parseFigmaUrl>;
    try {
      parsed = parseFigmaUrl(figmaUrl);
      checks.push({
        name: "url-parse",
        status: "ok",
        message: `Parsed node ${parsed.nodeId}.`,
      });
    } catch (error) {
      checks.push({
        name: "url-parse",
        status: "fail",
        message: (error as Error).message,
      });
      suggestions.add("Use a full Figma URL that includes a node-id query parameter.");

      return {
        status: summarizeHealthStatus(checks),
        endpoint: this.options.endpoint,
        checks,
        suggestions: [...suggestions],
      };
    }

    try {
      await this.callToolWithFallback("get_metadata", parsed);
      checks.push({
        name: "get_metadata",
        status: "ok",
        message: "Metadata fetch succeeded.",
      });
    } catch (error) {
      const diagnostic = diagnoseMcpHealthError((error as Error).message);
      checks.push({
        name: "get_metadata",
        status: diagnostic.status,
        message: diagnostic.summary,
      });
      for (const suggestion of diagnostic.suggestions) {
        suggestions.add(suggestion);
      }
    }

    return {
      status: summarizeHealthStatus(checks),
      endpoint: this.options.endpoint,
      checks,
      suggestions: [...suggestions],
    };
  }

  async fetchTarget(figmaUrl: string): Promise<FigmaTargetPayload> {
    const parsed = parseFigmaUrl(figmaUrl);
    await this.initialize();

    const warnings: string[] = [];
    let metadata: unknown;
    let designContextRootNodeId = parsed.nodeId;

    let designContext = await this.resolveDesignContextWithFallback(
      parsed,
      warnings,
    ).then((resolved) => {
      metadata = resolved.metadata;
      designContextRootNodeId = resolved.nodeId;
      return resolved.designContext;
    });

    if (typeof designContext === "string" && !isLikelyMetadataXml(designContext)) {
      warnings.push(
        "get_design_context returned code/text payload; switching to metadata for layer traversal.",
      );
      if (metadata === undefined) {
        metadata = await this.callToolWithFallback("get_metadata", parsed).catch((err) => {
          warnings.push(`Metadata fallback failed: ${(err as Error).message}`);
          return undefined;
        });
      }

      if (typeof metadata === "string") {
        designContext = metadata;
        designContextRootNodeId = parsed.nodeId;
      }
    }

    const expandedDesignContexts: Array<{ nodeId: string; context: unknown }> = [];
    if (isPossiblyTruncated(designContext)) {
      warnings.push("Design context may be truncated; using metadata for fallback inspection.");
      if (metadata === undefined) {
        metadata = await this.callToolWithFallback("get_metadata", parsed).catch((err) => {
          warnings.push(`Metadata fallback failed: ${(err as Error).message}`);
          return undefined;
        });
      }

      if (typeof metadata === "string") {
        const candidateNodeIds = selectSublayerCandidatesFromMetadata(
          metadata,
          designContextRootNodeId,
          this.options.sublayerExpansionLimit,
        );

        for (const nodeId of candidateNodeIds) {
          const expandedContext = await this.callToolWithFallback("get_design_context", {
            ...parsed,
            nodeId,
          }).catch((err) => {
            warnings.push(
              `Expanded design context fetch failed for node ${nodeId}: ${(err as Error).message}`,
            );
            return undefined;
          });

          if (expandedContext !== undefined) {
            expandedDesignContexts.push({
              nodeId,
              context: expandedContext,
            });
          }
        }

        if (expandedDesignContexts.length > 0) {
          warnings.push(
            `Expanded design context fetched for ${expandedDesignContexts.length} sublayers.`,
          );
        }
      }
    }

    const screenshotPayload = await this.callToolWithFallback("get_screenshot", parsed).catch(
      (err) => {
        warnings.push(`Screenshot fetch failed: ${(err as Error).message}`);
        return undefined;
      },
    );

    const variableDefs = await this.callToolWithFallback("get_variable_defs", parsed).catch(
      (err) => {
        warnings.push(`Variable definitions fetch failed: ${(err as Error).message}`);
        return undefined;
      },
    );

    const designSystemColors = extractDesignSystemColorsFromVariableDefs(variableDefs);

    const screenshot = await parseScreenshotPayload(screenshotPayload, warnings);

    const frameName =
      guessFrameName(designContext) ??
      guessFrameName(metadata) ??
      `Figma Node ${parsed.nodeId}`;

    return {
      figmaUrl: parsed.figmaUrl,
      nodeId: parsed.nodeId,
      frameName,
      designContext,
      expandedDesignContexts:
        expandedDesignContexts.length > 0 ? expandedDesignContexts : undefined,
      metadata,
      designSystemColors,
      screenshot,
      warnings,
    };
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.rpcRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {
        roots: {
          listChanged: true,
        },
        sampling: {},
      },
      clientInfo: {
        name: "aa-auditor",
        version: "0.1.0",
      },
    });

    // Some MCP servers expect this notification after initialize.
    await this.rpcRequest("notifications/initialized", {}, true);

    this.initialized = true;
  }

  private async callToolWithFallback(
    toolName: string,
    parsed: ReturnType<typeof parseFigmaUrl>,
  ): Promise<unknown> {
    const candidates = buildArgumentCandidates(toolName, parsed);
    const errors: string[] = [];

    for (const args of candidates) {
      try {
        const response = (await this.rpcRequest("tools/call", {
          name: toolName,
          arguments: args,
        })) as ToolCallResult;

        if (response.isError) {
          throw new Error(extractToolErrorMessage(response));
        }

        return extractToolResult(response);
      } catch (error) {
        errors.push(`args=${JSON.stringify(args)} -> ${(error as Error).message}`);
      }
    }

    throw new Error(
      `Failed to call MCP tool \"${toolName}\". Attempts: ${errors.join(" | ")}`,
    );
  }

  private async resolveDesignContextWithFallback(
    parsed: ReturnType<typeof parseFigmaUrl>,
    warnings: string[],
  ): Promise<{ designContext: unknown; nodeId: string; metadata?: unknown }> {
    try {
      const designContext = await this.callToolWithFallback("get_design_context", parsed);
      return {
        designContext,
        nodeId: parsed.nodeId,
      };
    } catch (primaryError) {
      warnings.push(
        `Primary design context fetch failed for node ${parsed.nodeId}; attempting metadata/ancestor fallback.`,
      );

      const metadata = await this.callToolWithFallback("get_metadata", parsed).catch((err) => {
        warnings.push(`Metadata fallback failed: ${(err as Error).message}`);
        return undefined;
      });

      if (typeof metadata === "string") {
        const ancestorCandidates = selectAncestorCandidatesFromMetadata(
          metadata,
          parsed.nodeId,
          6,
        );

        for (const ancestorNodeId of ancestorCandidates) {
          const designContext = await this.callToolWithFallback("get_design_context", {
            ...parsed,
            nodeId: ancestorNodeId,
          }).catch((err) => {
            warnings.push(
              `Ancestor design context fetch failed for node ${ancestorNodeId}: ${(err as Error).message}`,
            );
            return undefined;
          });

          if (designContext !== undefined) {
            warnings.push(
              `Using ancestor node ${ancestorNodeId} design context because direct fetch for ${parsed.nodeId} failed.`,
            );
            return {
              designContext,
              nodeId: ancestorNodeId,
              metadata,
            };
          }
        }

        warnings.push(
          `Proceeding with metadata-only context for ${parsed.nodeId} because design-context fetch failed for node and ancestors.`,
        );
        return {
          designContext: metadata,
          nodeId: parsed.nodeId,
          metadata,
        };
      }

      throw primaryError;
    }
  }

  private async rpcRequest(
    method: string,
    params: unknown,
    notification = false,
  ): Promise<unknown> {
    const id = notification ? undefined : this.nextId++;
    const body: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
      params,
    };

    if (!notification) {
      body.id = id;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    let response: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.options.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "X-Figma-Region": this.options.region,
      };

      if (this.sessionId) {
        headers["mcp-session-id"] = this.sessionId;
      }

      response = await fetch(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} from MCP endpoint: ${await response.text()}`,
      );
    }

    const returnedSessionId = response.headers.get("mcp-session-id");
    if (returnedSessionId) {
      this.sessionId = returnedSessionId;
    }

    const text = await response.text();
    if (notification && text.trim() === "") {
      return undefined;
    }

    const message = parseJsonRpcPayload(text);

    if (message.error) {
      throw new Error(
        `MCP error ${message.error.code}: ${message.error.message}`,
      );
    }

    return message.result;
  }
}

function summarizeHealthStatus(checks: FigmaMcpHealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "ok";
}

export function diagnoseMcpHealthError(message: string): {
  status: HealthStatus;
  summary: string;
  suggestions: string[];
} {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("figma_oauth_token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("http 401") ||
    normalized.includes("oauth")
  ) {
    return {
      status: "fail",
      summary: "Authentication failed for Figma MCP.",
      suggestions: [
        "Verify FIGMA_OAUTH_TOKEN is set and valid in the shell running aa-auditor.",
        "Restart Codex/Figma MCP after refreshing the token.",
      ],
    };
  }

  if (normalized.includes("no figma window open")) {
    return {
      status: "fail",
      summary: "Figma desktop is not exposing an active window to local MCP.",
      suggestions: [
        "Open Figma desktop and keep the target file open in the foreground.",
      ],
    };
  }

  if (normalized.includes("enablecodegenmcpserver")) {
    return {
      status: "fail",
      summary: "Local Figma MCP bridge is in a broken Codegen state.",
      suggestions: [
        "Fully quit and reopen Figma desktop, then reopen the target file.",
        "Update Figma desktop to the latest version and retry health.",
      ],
    };
  }

  if (normalized.includes("only available for design, figjam, and make files")) {
    return {
      status: "fail",
      summary: "MCP rejected this target as unsupported file context.",
      suggestions: [
        "Open the URL in a standard Figma Design/FigJam/Make file tab, not a restricted view.",
        "Retry with a plain /design/... URL and node-id while that file is open.",
      ],
    };
  }

  if (
    normalized.includes("operation was aborted") ||
    normalized.includes("aborted") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch failed")
  ) {
    return {
      status: "fail",
      summary: "MCP request timed out or was aborted.",
      suggestions: [
        "Restart Figma desktop and close heavy files to recover memory.",
        "Increase FIGMA_MCP_TIMEOUT_MS (for example 30000-60000) and retry.",
      ],
    };
  }

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("couldn't connect") ||
    normalized.includes("enotfound")
  ) {
    return {
      status: "fail",
      summary: "Could not connect to the configured MCP endpoint.",
      suggestions: [
        "Verify FIGMA_MCP_URL and ensure the local MCP server process is running.",
      ],
    };
  }

  return {
    status: "fail",
    summary: message,
    suggestions: [
      "Inspect Figma desktop + MCP server logs and retry after restart.",
    ],
  };
}

function buildArgumentCandidates(
  toolName: string,
  parsed: ReturnType<typeof parseFigmaUrl>,
): unknown[] {
  const fileUrl = deriveFileUrl(parsed);
  const common = {
    nodeId: parsed.nodeId,
    clientLanguages: "typescript",
    clientFrameworks: "node",
  };

  if (toolName === "get_design_context") {
    return [
      {
        ...common,
        artifactType: "COMPONENT_WITHIN_A_WEB_PAGE_OR_APP_SCREEN",
      },
      {
        url: parsed.figmaUrl,
        clientLanguages: "typescript",
        clientFrameworks: "node",
        artifactType: "COMPONENT_WITHIN_A_WEB_PAGE_OR_APP_SCREEN",
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
              clientLanguages: "typescript",
              clientFrameworks: "node",
              artifactType: "COMPONENT_WITHIN_A_WEB_PAGE_OR_APP_SCREEN",
            },
            {
              url: fileUrl,
              clientLanguages: "typescript",
              clientFrameworks: "node",
              artifactType: "COMPONENT_WITHIN_A_WEB_PAGE_OR_APP_SCREEN",
            },
          ]
        : []),
      common,
      {
        url: parsed.figmaUrl,
        clientLanguages: "typescript",
        clientFrameworks: "node",
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
            {
              url: fileUrl,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
          ]
        : []),
      {
        url: parsed.figmaUrl,
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
            },
            {
              url: fileUrl,
            },
          ]
        : []),
      { nodeId: parsed.nodeId },
    ];
  }

  if (toolName === "get_screenshot" || toolName === "get_variable_defs") {
    return [
      common,
      {
        url: parsed.figmaUrl,
        clientLanguages: "typescript",
        clientFrameworks: "node",
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
            {
              url: fileUrl,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
          ]
        : []),
      {
        url: parsed.figmaUrl,
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
            },
            {
              url: fileUrl,
            },
          ]
        : []),
      { nodeId: parsed.nodeId },
    ];
  }

  if (toolName === "get_metadata") {
    return [
      common,
      { nodeId: parsed.nodeId },
      {
        url: parsed.figmaUrl,
        clientLanguages: "typescript",
        clientFrameworks: "node",
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
            {
              url: fileUrl,
              clientLanguages: "typescript",
              clientFrameworks: "node",
            },
          ]
        : []),
      {
        url: parsed.figmaUrl,
      },
      ...(fileUrl
        ? [
            {
              url: fileUrl,
              nodeId: parsed.nodeId,
            },
            {
              url: fileUrl,
            },
          ]
        : []),
    ];
  }

  return [
    common,
    { nodeId: parsed.nodeId },
  ];
}

function parseJsonRpcPayload(raw: string): JsonRpcResult {
  // Streamable HTTP MCP can prepend SSE lines ("data: {...}").
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const jsonText = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!jsonText.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(jsonText) as JsonRpcResult;
    } catch {
      // Keep trying other lines.
    }
  }

  try {
    return JSON.parse(raw) as JsonRpcResult;
  } catch {
    throw new Error(`Unable to parse MCP response payload: ${raw.slice(0, 240)}`);
  }
}

function deriveFileUrl(parsed: ReturnType<typeof parseFigmaUrl>): string | undefined {
  if (!parsed.fileKey) {
    return undefined;
  }

  return `https://www.figma.com/design/${parsed.fileKey}`;
}

function extractToolResult(result: ToolCallResult): unknown {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const content = result.content;
  if (!Array.isArray(content)) {
    return result;
  }

  for (const item of content) {
    if (typeof item.text === "string") {
      const parsed = tryParseJson(item.text);
      if (parsed !== undefined) {
        return parsed;
      }
      return item.text;
    }

    if (typeof item.url === "string") {
      return { sourceUrl: item.url };
    }

    if (typeof item.data === "string") {
      return { base64: item.data, mimeType: item.mimeType };
    }
  }

  return result;
}

function extractToolErrorMessage(result: ToolCallResult): string {
  const parts: string[] = [];

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (typeof item.text === "string" && item.text.trim()) {
        parts.push(item.text.trim());
      }
    }
  }

  if (parts.length > 0) {
    return parts.join(" | ");
  }

  return "MCP tool returned an unspecified error.";
}

function tryParseJson(input: string): unknown | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const inFence = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  const candidate = inFence ? inFence[1] : trimmed;

  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function guessFrameName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct = record.name;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const node = record.node;
  if (node && typeof node === "object") {
    const nodeName = (node as Record<string, unknown>).name;
    if (typeof nodeName === "string" && nodeName.trim()) {
      return nodeName.trim();
    }
  }

  const document = record.document;
  if (document && typeof document === "object") {
    const docName = (document as Record<string, unknown>).name;
    if (typeof docName === "string" && docName.trim()) {
      return docName.trim();
    }
  }

  return undefined;
}

function isPossiblyTruncated(payload: unknown): boolean {
  const serialized = JSON.stringify(payload) ?? "";
  if (serialized.length > 1_000_000) {
    return true;
  }

  return /truncated|omitted|too large to fit into context/i.test(
    serialized.slice(0, 8000),
  );
}

function isLikelyMetadataXml(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return /<[a-zA-Z0-9_-]+[^>]*\bid="/.test(trimmed);
}

async function parseScreenshotPayload(
  payload: unknown,
  warnings: string[],
): Promise<FigmaTargetPayload["screenshot"] | undefined> {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.sourceUrl === "string") {
    return {
      sourceUrl: record.sourceUrl,
    };
  }

  const url =
    typeof record.url === "string"
      ? record.url
      : typeof record.imageUrl === "string"
        ? record.imageUrl
        : undefined;

  if (url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      return {
        bytes: buffer,
        ext: guessExtension(response.headers.get("content-type"), url),
        sourceUrl: url,
      };
    } catch (err) {
      warnings.push(`Could not download screenshot from ${url}: ${(err as Error).message}`);
      return { sourceUrl: url };
    }
  }

  const base64 =
    typeof record.base64 === "string"
      ? record.base64
      : typeof record.data === "string"
        ? record.data
        : undefined;

  if (!base64) {
    return undefined;
  }

  const mime = typeof record.mimeType === "string" ? record.mimeType : undefined;
  return {
    bytes: Uint8Array.from(Buffer.from(base64, "base64")),
    ext: guessExtension(mime),
  };
}

function guessExtension(mimeType?: string | null, url?: string): "png" | "jpg" | "jpeg" | "webp" {
  const fromMime = mimeType?.toLowerCase();
  if (fromMime?.includes("webp")) {
    return "webp";
  }
  if (fromMime?.includes("jpeg")) {
    return "jpeg";
  }
  if (fromMime?.includes("jpg")) {
    return "jpg";
  }

  if (url) {
    if (url.endsWith(".webp")) {
      return "webp";
    }
    if (url.endsWith(".jpeg")) {
      return "jpeg";
    }
    if (url.endsWith(".jpg")) {
      return "jpg";
    }
  }

  return "png";
}

export async function persistScreenshot(
  payload: FigmaTargetPayload,
  assetsDir: string,
): Promise<string | undefined> {
  if (!payload.screenshot) {
    return undefined;
  }

  const ext = payload.screenshot.ext ?? "png";
  const fileName = `${sanitize(payload.nodeId)}.${ext}`;
  const outputPath = join(assetsDir, fileName);

  if (payload.screenshot.bytes) {
    await mkdir(assetsDir, { recursive: true });
    await writeFile(outputPath, payload.screenshot.bytes);
    return outputPath;
  }

  if (payload.screenshot.sourceUrl) {
    return payload.screenshot.sourceUrl;
  }

  return undefined;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "_");
}
