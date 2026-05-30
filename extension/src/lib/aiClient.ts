import type { ChatMessage, PageContext } from "./pageTypes";
import { truncateMarkdown } from "./truncate";

const SYSTEM_PROMPT = `You are a web reading and learning assistant. The user is reading a web page, and you will be provided with the page title, URL, and Markdown content. Prioritize answering questions based on the web page content. If the page content is insufficient, clearly state "I'm not sure" or "The page doesn't contain enough information." When answering, explain concepts, cite original references from the page, and help the user understand the context. Do not fabricate information that is not present on the page.

If the page context is empty or null, tell the user to extract the page content first and answer based on general knowledge while being transparent about it.`;

export type ApiFormat = "anthropic" | "openai";

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  apiFormat: ApiFormat;
}

export interface ImageData {
  url: string;
  base64?: string;
  mediaType?: string;
}

function buildSystemPrompt(
  pageContext: PageContext | null,
  maxContextChars: number
): string {
  let prompt = SYSTEM_PROMPT;
  if (pageContext) {
    const truncated = truncateMarkdown(
      pageContext.markdown || pageContext.plainText || "",
      maxContextChars
    );
    prompt += `\n\n## Current Page\n- Title: ${pageContext.title}\n- URL: ${pageContext.url}\n\n### Page Content (Markdown):\n${truncated}`;
  }
  return prompt;
}

// ── SSE Stream Parser ──────────────────────────────────────────

type SSEHandler = {
  onData: (data: Record<string, unknown>) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

async function readSSEStream(res: Response, handler: SSEHandler): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            handler.onDone();
            return;
          }
          dataLines.push(payload);
        } else if (line === "" && dataLines.length > 0) {
          try {
            const json = JSON.parse(dataLines.join("\n"));
            handler.onData(json);
          } catch {
            // skip unparseable chunks
          }
          dataLines = [];
        }
      }
    }
    handler.onDone();
  } catch (err) {
    handler.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}

// ── Anthropic Messages API (streaming + prompt caching) ─────────

async function callAnthropicAPI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  images: ImageData[],
  config: AIConfig,
  onChunk: (text: string) => void
): Promise<string> {
  // Build system as cacheable blocks
  const systemBlocks: Record<string, unknown>[] = [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
  ];

  // Build messages with cache control
  const messages: Record<string, unknown>[] = [];

  // Cache history except the most recent 2 turns
  const cacheHistoryCutoff = Math.max(0, history.length - 2);
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    const content = msg.content;
    if (i === cacheHistoryCutoff - 1 && i >= 0) {
      // Mark the last cached message with cache_control
      messages.push({
        role: msg.role,
        content: [{ type: "text", text: content, cache_control: { type: "ephemeral" } }],
      });
    } else {
      messages.push({ role: msg.role, content });
    }
  }

  // Current user message: images cacheable, question not
  const userContent = buildUserContent(images, "anthropic", question);
  // Mark the last image (or first text if no images) as the final cache breakpoint
  let cachedFinal = false;
  for (let i = userContent.length - 1; i >= 0; i--) {
    const block = userContent[i];
    if (!cachedFinal && (block.type === "image" || i === userContent.length - 1)) {
      userContent[i] = { ...block, cache_control: { type: "ephemeral" } };
      cachedFinal = true;
      break;
    }
  }
  messages.push({ role: "user", content: userContent });

  const url = buildURL(config.baseURL, "/messages");
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    system: systemBlocks,
    messages,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2024-02-15",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw apiError(res.status, body);
  }

  let fullText = "";
  let hasStreamed = false;

  await readSSEStream(res, {
    onData(data) {
      if (data.type === "content_block_delta") {
        const delta = data.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          fullText += delta.text;
          onChunk(delta.text);
          hasStreamed = true;
        }
      }
    },
    onDone() {
      // stream ended
    },
    onError(err) {
      if (!hasStreamed) throw err;
    },
  });

  return fullText;
}

// ── OpenAI-compatible Chat Completions API (streaming) ───────────

async function callOpenAIAPI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  images: ImageData[],
  config: AIConfig,
  onChunk: (text: string) => void
): Promise<string> {
  const userContent = buildUserContent(images, "openai", question);
  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userContent },
  ];

  const url = buildURL(config.baseURL, "/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw apiError(res.status, body);
  }

  let fullText = "";
  let hasStreamed = false;

  await readSSEStream(res, {
    onData(data) {
      const choices = data.choices as
        | { delta?: { content?: string }; finish_reason?: string }[]
        | undefined;
      const content = choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        onChunk(content);
        hasStreamed = true;
      }
    },
    onDone() {
      // stream ended
    },
    onError(err) {
      if (!hasStreamed) throw err;
    },
  });

  return fullText;
}

// ── Message builders ──────────────────────────────────────────

function buildUserContent(
  images: ImageData[],
  format: "anthropic" | "openai",
  question: string
): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];
  let imgIdx = 0;

  for (const img of images) {
    if (!img.base64 || !img.mediaType) continue;
    imgIdx++;
    content.push({ type: "text", text: `[Image ${imgIdx}]` });
    if (format === "anthropic") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    } else {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      });
    }
  }

  const prefix =
    imgIdx > 0
      ? `The above ${imgIdx} image(s) (labeled [Image 1] to [Image ${imgIdx}]) are from the current web page. You can reference specific images by their number. `
      : "";

  content.push({ type: "text", text: prefix + question });
  return content;
}

// ── Shared ────────────────────────────────────────────────────

function apiError(status: number, body: string): Error {
  if (status === 401) {
    return new Error(
      "API authentication failed. Please check your API key in Settings."
    );
  }
  if (status === 429) {
    return new Error("API rate limit exceeded. Please wait and try again.");
  }
  return new Error(`API error ${status}: ${body}`);
}

function buildURL(baseURL: string, path: string): string {
  const base = baseURL.replace(/\/+$/, "");
  if (base.endsWith("/v1") || base.endsWith("/v1beta")) {
    return `${base}${path}`;
  }
  return `${base}/v1${path}`;
}

export async function callAIDirect(
  pageContext: PageContext | null,
  messages: ChatMessage[],
  question: string,
  config: AIConfig,
  maxContextChars: number,
  images: ImageData[],
  onChunk: (text: string) => void
): Promise<string> {
  const systemPrompt = buildSystemPrompt(pageContext, maxContextChars);

  if (config.apiFormat === "openai") {
    return callOpenAIAPI(systemPrompt, messages, question, images, config, onChunk);
  }
  return callAnthropicAPI(systemPrompt, messages, question, images, config, onChunk);
}
