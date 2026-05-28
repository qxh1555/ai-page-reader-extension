import type { ChatMessage, PageContext } from "./types.js";
export interface AIClientOptions {
    apiKey: string;
    baseURL?: string;
    model: string;
}
export declare function callAI(pageContext: PageContext | null, messages: ChatMessage[], question: string, options: AIClientOptions, maxContextChars: number): Promise<string>;
