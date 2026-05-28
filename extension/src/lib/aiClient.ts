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

// ── Anthropic Messages API ──────────────────────────────────────

async function callAnthropicAPI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  images: ImageData[],
  config: AIConfig
): Promise<string> {
  // Build user content: images + text
  const userContent: Record<string, unknown>[] = [];

  for (const img of images) {
    if (!img.base64 || !img.mediaType) continue;
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType,
        data: img.base64,
      },
    });
  }

  const questionText =
    images.length > 0
      ? `The above ${images.length} image(s) are from the current web page. Use them as visual context when answering. ${question}`
      : question;

  userContent.push({ type: "text", text: questionText });

  const messages: Record<string, unknown>[] = [
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userContent },
  ];

  const url = buildURL(config.baseURL, "/messages");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw apiError(res.status, body);
  }

  const data = await res.json();
  const texts = (data.content || []).filter(
    (b: { type: string }) => b.type === "text"
  );
  return texts.map((b: { text: string }) => b.text).join("\n") || "";
}

// ── OpenAI-compatible Chat Completions API ───────────────────────

async function callOpenAIAPI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  images: ImageData[],
  config: AIConfig
): Promise<string> {
  // Build user content: images + text
  const userContent: Record<string, unknown>[] = [];

  for (const img of images) {
    if (!img.base64 || !img.mediaType) continue;
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mediaType};base64,${img.base64}`,
      },
    });
  }

  const questionText =
    images.length > 0
      ? `The above ${images.length} image(s) are from the current web page. Use them as visual context when answering. ${question}`
      : question;

  userContent.push({ type: "text", text: questionText });

  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
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
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw apiError(res.status, body);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Shared ───────────────────────────────────────────────────────

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
  // If base already ends with /v1 or /v1beta etc, don't double it
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
  images: ImageData[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt(pageContext, maxContextChars);

  if (config.apiFormat === "openai") {
    return callOpenAIAPI(systemPrompt, messages, question, images, config);
  }
  return callAnthropicAPI(systemPrompt, messages, question, images, config);
}
