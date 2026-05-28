import type { ChatMessage, PageContext } from "./pageTypes";
import { truncateMarkdown } from "./truncate";

const SYSTEM_PROMPT = `You are a web reading and learning assistant. The user is reading a web page, and you will be provided with the page title, URL, and Markdown content. Prioritize answering questions based on the web page content. If the page content is insufficient, clearly state "I'm not sure" or "The page doesn't contain enough information." When answering, explain concepts, cite original references from the page, and help the user understand the context. Do not fabricate information that is not present on the page.

If the page context is empty or null, tell the user to extract the page content first and answer based on general knowledge while being transparent about it.`;

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export async function callAIDirect(
  pageContext: PageContext | null,
  messages: ChatMessage[],
  question: string,
  config: AIConfig,
  maxContextChars: number
): Promise<string> {
  let systemPrompt = SYSTEM_PROMPT;
  if (pageContext) {
    const truncated = truncateMarkdown(
      pageContext.markdown || pageContext.plainText || "",
      maxContextChars
    );
    systemPrompt += `\n\n## Current Page\n- Title: ${pageContext.title}\n- URL: ${pageContext.url}\n\n### Page Content (Markdown):\n${truncated}`;
  }

  const apiMessages = [
    ...messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: question },
  ];

  const baseURL = config.baseURL.replace(/\/+$/, "");

  const response = await fetch(`${baseURL}/v1/messages`, {
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
      messages: apiMessages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new Error(
        "API authentication failed. Please check your API key in Settings."
      );
    }
    if (response.status === 429) {
      throw new Error("API rate limit exceeded. Please wait and try again.");
    }
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const textBlocks = data.content?.filter(
    (block: { type: string }) => block.type === "text"
  );
  return textBlocks?.map((b: { text: string }) => b.text).join("\n") || "";
}
