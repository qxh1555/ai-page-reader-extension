import "dotenv/config";
import express from "express";
import cors from "cors";
import { callAI } from "./ai/anthropicClient.js";
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_LENGTH || "30000", 10);
const AI_PROVIDER = process.env.AI_PROVIDER || "anthropic";
function getProviderConfig() {
    switch (AI_PROVIDER) {
        case "deepseek":
            return {
                apiKey: process.env.DEEPSEEK_API_KEY || "",
                baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
                model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
            };
        case "openai":
            return {
                apiKey: process.env.OPENAI_API_KEY || "",
                baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com",
                model: process.env.OPENAI_MODEL || "gpt-4o",
            };
        case "custom":
            return {
                apiKey: process.env.CUSTOM_API_KEY || "",
                baseURL: process.env.CUSTOM_BASE_URL || "http://localhost:11434",
                model: process.env.CUSTOM_MODEL || "llama3",
            };
        case "anthropic":
        default:
            return {
                apiKey: process.env.ANTHROPIC_API_KEY || "",
                baseURL: "https://api.anthropic.com",
                model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            };
    }
}
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", provider: AI_PROVIDER });
});
app.post("/api/chat", async (req, res) => {
    try {
        const config = getProviderConfig();
        if (!config.apiKey) {
            res.status(500).json({
                error: `API key not configured for provider "${AI_PROVIDER}". Set it in .env and restart the server.`,
            });
            return;
        }
        const { pageContext, messages, question } = req.body;
        if (!question || !question.trim()) {
            res.status(400).json({ error: "Question is required." });
            return;
        }
        if (!Array.isArray(messages)) {
            res.status(400).json({ error: "messages must be an array." });
            return;
        }
        const answer = await callAI(pageContext || null, messages, question.trim(), config, MAX_CONTEXT_CHARS);
        res.json({ answer });
    }
    catch (err) {
        console.error("Chat error:", err);
        if (err instanceof Error) {
            if (err.message.includes("401") ||
                err.message.includes("authentication")) {
                res.status(500).json({
                    error: "API authentication failed. Please check your API key.",
                });
                return;
            }
            if (err.message.includes("429") || err.message.includes("rate")) {
                res.status(500).json({
                    error: "API rate limit exceeded. Please wait and try again.",
                });
                return;
            }
            if (err.message.includes("context_length") ||
                err.message.includes("too long")) {
                res.status(500).json({
                    error: "Input is too long. Try reducing the page context length.",
                });
                return;
            }
            res.status(500).json({ error: `AI request failed: ${err.message}` });
        }
        else {
            res.status(500).json({ error: "Unknown error occurred." });
        }
    }
});
app.listen(PORT, () => {
    console.log(`AI Page Reader server running on http://localhost:${PORT}`);
    console.log(`AI Provider: ${AI_PROVIDER}`);
    const config = getProviderConfig();
    if (!config.apiKey) {
        console.warn(`WARNING: API key for "${AI_PROVIDER}" is not set.`);
    }
});
