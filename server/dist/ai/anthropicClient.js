import Anthropic from "@anthropic-ai/sdk";
import { truncateText } from "../utils/truncate.js";
const SYSTEM_PROMPT = `You are a web reading and learning assistant. The user is reading a web page, and you will be provided with the page title, URL, and Markdown content. Prioritize answering questions based on the web page content. If the page content is insufficient, clearly state "I'm not sure" or "The page doesn't contain enough information." When answering, explain concepts, cite original references from the page, and help the user understand the context. Do not fabricate information that is not present on the page.

If the page context is empty or null, tell the user to extract the page content first and answer based on general knowledge while being transparent about it.`;
export async function callAI(pageContext, messages, question, options, maxContextChars) {
    const anthropic = new Anthropic({
        apiKey: options.apiKey,
        baseURL: options.baseURL || "https://api.anthropic.com",
    });
    let systemPrompt = SYSTEM_PROMPT;
    if (pageContext) {
        const truncatedMarkdown = truncateText(pageContext.markdown || pageContext.plainText || "", maxContextChars);
        systemPrompt += `\n\n## Current Page\n- Title: ${pageContext.title}\n- URL: ${pageContext.url}\n\n### Page Content (Markdown):\n${truncatedMarkdown}`;
    }
    const anthropicMessages = [
        ...messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        })),
        { role: "user", content: question },
    ];
    const response = await anthropic.messages.create({
        model: options.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
    });
    const textBlocks = response.content.filter((block) => block.type === "text");
    return textBlocks.map((block) => block.text).join("\n");
}
