import { useState, useCallback, useRef, useEffect } from "react";
import type { PageContext, ChatMessage } from "../lib/pageTypes";
import { extractPageContext } from "../lib/messaging";
import { truncateMarkdown } from "../lib/truncate";
import { callAIDirect, type ImageData, type ApiFormat } from "../lib/aiClient";

const STORAGE_KEYS = {
  apiKey: "aiPageReader_apiKey",
  baseURL: "aiPageReader_baseURL",
  model: "aiPageReader_model",
  apiFormat: "aiPageReader_apiFormat",
  maxContext: "aiPageReader_maxContext",
  maxImages: "aiPageReader_maxImages",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image
const DEFAULT_MAX_IMAGES = 5;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function guessTypeFromURL(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".gif")) return "image/gif";
  } catch {
    // invalid URL
  }
  return null;
}

// Download images and convert to base64.
// Uses blob.type (browser magic-byte detection) as primary media type —
// more reliable than Content-Type header which servers may set incorrectly.
async function downloadImages(
  urls: { url: string; alt: string }[],
  maxCount: number
): Promise<ImageData[]> {
  const results: ImageData[] = [];
  for (const { url } of urls) {
    if (results.length >= maxCount) break;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const blob = await res.blob();
      if (blob.size > MAX_IMAGE_BYTES || blob.size === 0) continue;

      // Primary: browser-detected type from magic bytes
      let mediaType = blob.type.toLowerCase();

      // Fallback: Content-Type header
      if (!ALLOWED_TYPES.has(mediaType)) {
        const ct = (res.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (ALLOWED_TYPES.has(ct)) mediaType = ct;
      }

      // Fallback: URL extension
      if (!ALLOWED_TYPES.has(mediaType)) {
        const guessed = guessTypeFromURL(url);
        if (guessed) mediaType = guessed;
      }

      if (!ALLOWED_TYPES.has(mediaType)) continue;

      // Read as base64 data URL, strip the prefix
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const b64 = result.split(",")[1] || result;
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (!base64 || base64.length < 10) continue;

      results.push({ url, base64, mediaType });
    } catch {
      // Skip (CORS, 404, etc.)
    }
  }
  return results;
}

export function SidePanelApp() {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);

  // Config state
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-chat");
  const [apiFormat, setApiFormat] = useState<ApiFormat>("anthropic");
  const [maxContextChars, setMaxContextChars] = useState(30000);
  const [maxImages, setMaxImages] = useState(DEFAULT_MAX_IMAGES);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved config
  useEffect(() => {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), (result) => {
      if (result[STORAGE_KEYS.apiKey]) setApiKey(result[STORAGE_KEYS.apiKey]);
      if (result[STORAGE_KEYS.baseURL]) setBaseURL(result[STORAGE_KEYS.baseURL]);
      if (result[STORAGE_KEYS.model]) setModel(result[STORAGE_KEYS.model]);
      if (result[STORAGE_KEYS.apiFormat])
        setApiFormat(result[STORAGE_KEYS.apiFormat] as ApiFormat);
      if (result[STORAGE_KEYS.maxContext])
        setMaxContextChars(result[STORAGE_KEYS.maxContext]);
      if (result[STORAGE_KEYS.maxImages] !== undefined)
        setMaxImages(result[STORAGE_KEYS.maxImages]);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const persist = useCallback(
    (key: string, value: string | number | boolean) => {
      chrome.storage.local.set({ [key]: value });
    },
    []
  );

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setError("");
    try {
      const ctx = await extractPageContext();
      setPageContext(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract page");
      setPageContext(null);
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question) return;
    setInput("");
    setError("");

    const userMsg: ChatMessage = { role: "user", content: question };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    setLoading(true);
    setLoadingImages(true);
    try {
      const truncatedContext = pageContext
        ? {
            ...pageContext,
            markdown: truncateMarkdown(pageContext.markdown, maxContextChars),
            plainText: truncateMarkdown(pageContext.plainText, maxContextChars),
          }
        : null;

      if (!apiKey) {
        throw new Error(
          "API key not configured. Click the gear icon to set it in Settings."
        );
      }

      // Download images from page
      setLoadingImages(true);
      const images = await downloadImages(
        pageContext?.images || [],
        maxImages
      );
      setLoadingImages(false);

      const answer = await callAIDirect(
        truncatedContext,
        newMessages,
        question,
        { apiKey, baseURL, model, apiFormat },
        maxContextChars,
        images
      );

      const assistantMsg: ChatMessage = { role: "assistant", content: answer };
      setMessages([...newMessages, assistantMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Cannot connect. Check your network or the API Base URL.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setLoadingImages(false);
    }
  }, [input, messages, pageContext, maxContextChars, apiKey, baseURL, model, apiFormat, maxImages]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setError("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const previewMarkdown = pageContext
    ? truncateMarkdown(pageContext.markdown, 5000)
    : "";

  const imageCount = pageContext?.images?.length || 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>AI Page Reader</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={styles.settingsBtn}
          title="Settings"
        >
          {showSettings ? "✕" : "⚙"}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                persist(STORAGE_KEYS.apiKey, e.target.value);
              }}
              placeholder="sk-..."
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>Base URL</label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => {
                setBaseURL(e.target.value);
                persist(STORAGE_KEYS.baseURL, e.target.value);
              }}
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                persist(STORAGE_KEYS.model, e.target.value);
              }}
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>API Format</label>
            <select
              value={apiFormat}
              onChange={(e) => {
                const v = e.target.value as ApiFormat;
                setApiFormat(v);
                persist(STORAGE_KEYS.apiFormat, v);
              }}
              style={styles.settingSelect}
            >
              <option value="anthropic">Anthropic Messages</option>
              <option value="openai">OpenAI Compatible</option>
            </select>
          </div>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>Max context chars</label>
            <input
              type="number"
              value={maxContextChars}
              onChange={(e) => {
                setMaxContextChars(Number(e.target.value));
                persist(STORAGE_KEYS.maxContext, Number(e.target.value));
              }}
              style={{ ...styles.settingInput, width: 100 }}
              min={1000}
              max={200000}
            />
          </div>
          <div style={styles.settingGroup}>
            <label style={styles.settingLabel}>Max images</label>
            <input
              type="number"
              value={maxImages}
              onChange={(e) => {
                setMaxImages(Number(e.target.value));
                persist(STORAGE_KEYS.maxImages, Number(e.target.value));
              }}
              style={{ ...styles.settingInput, width: 80 }}
              min={0}
              max={20}
            />
          </div>
        </div>
      )}

      {/* Page info */}
      <div style={styles.pageSection}>
        {pageContext ? (
          <>
            <div style={styles.pageTitle}>{pageContext.title}</div>
            <div style={styles.pageUrl}>{pageContext.url}</div>
            {imageCount > 0 && (
              <div style={styles.imageInfo}>
                {imageCount} image(s) found (up to {maxImages} will be sent)
              </div>
            )}
          </>
        ) : (
          <div style={styles.noPageText}>
            Click "Read Page" to extract the current page content.
          </div>
        )}
        <button
          onClick={handleExtract}
          disabled={extracting}
          style={styles.primaryBtn}
        >
          {extracting
            ? "Extracting..."
            : pageContext
            ? "Refresh Page Context"
            : "Read Page"}
        </button>
      </div>

      {/* Markdown preview */}
      {pageContext && (
        <div style={styles.previewSection}>
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={styles.previewToggle}
          >
            {showPreview ? "Hide Preview" : "Show Preview"} (Markdown
            {imageCount > 0 ? ` + ${imageCount} images` : ""})
          </button>
          {showPreview && (
            <>
              {imageCount > 0 && (
                <div style={styles.imagePreviewGrid}>
                  {pageContext.images.slice(0, maxImages).map((img, i) => (
                    <div key={i} style={styles.imageThumbWrap}>
                      <img
                        src={img.url}
                        alt={img.alt || `Image ${i + 1}`}
                        style={styles.imageThumb}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <pre style={styles.previewContent}>{previewMarkdown}</pre>
            </>
          )}
        </div>
      )}

      {/* Chat messages */}
      <div style={styles.chatSection}>
        {messages.length === 0 && !loading && (
          <div style={styles.chatPlaceholder}>
            Ask a question about the current page.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background: msg.role === "user" ? "#e3f2fd" : "#f5f5f5",
            }}
          >
            <div style={styles.messageRole}>
              {msg.role === "user" ? "You" : "AI"}
            </div>
            <div style={styles.messageContent}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ ...styles.message, background: "#f5f5f5" }}>
            <div style={styles.messageRole}>AI</div>
            <div style={styles.messageContent}>
              {loadingImages ? "Downloading images..." : "Thinking..."}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Privacy note */}
      <div style={styles.privacyNote}>
        Page content{maxImages > 0 ? " + images" : ""} sent directly to{" "}
        {baseURL}
      </div>

      {/* Input */}
      <div style={styles.inputSection}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            pageContext
              ? "Ask about this page... (Enter to send)"
              : 'Click "Read Page" first, then ask questions...'
          }
          style={styles.textarea}
          rows={3}
          disabled={loading}
        />
        <div style={styles.inputButtons}>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={styles.sendBtn}
          >
            Send
          </button>
          <button onClick={handleClear} style={styles.clearBtn}>
            Clear Chat
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    fontSize: 14,
    background: "#fff",
    color: "#333",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
    background: "#fafafa",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600 },
  settingsBtn: {
    background: "none",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 8px",
  },
  settingsPanel: {
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
    background: "#fafafa",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  settingGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  settingLabel: {
    fontSize: 12,
    minWidth: 110,
    color: "#555",
  },
  settingInput: {
    flex: 1,
    padding: "4px 8px",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 4,
  },
  settingSelect: {
    padding: "4px 8px",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#fff",
  },
  pageSection: {
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
  },
  pageTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
    wordBreak: "break-word",
  },
  pageUrl: {
    fontSize: 11,
    color: "#888",
    wordBreak: "break-all",
    marginBottom: 4,
  },
  imageInfo: {
    fontSize: 11,
    color: "#1976d2",
    marginBottom: 8,
  },
  noPageText: { fontSize: 13, color: "#999", marginBottom: 8 },
  primaryBtn: {
    padding: "6px 14px",
    fontSize: 13,
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  previewSection: {
    padding: "8px 16px",
    borderBottom: "1px solid #e0e0e0",
  },
  previewToggle: {
    fontSize: 12,
    background: "none",
    border: "none",
    color: "#1976d2",
    cursor: "pointer",
    padding: 0,
    marginBottom: 8,
  },
  previewContent: {
    fontSize: 11,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 200,
    overflow: "auto",
    background: "#fafafa",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #eee",
  },
  imagePreviewGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
    maxHeight: 150,
    overflow: "auto",
  },
  imageThumbWrap: {
    width: 80,
    height: 80,
    overflow: "hidden",
    borderRadius: 4,
    border: "1px solid #eee",
    background: "#f0f0f0",
    flexShrink: 0,
  },
  imageThumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  chatSection: {
    flex: 1,
    overflow: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  chatPlaceholder: {
    color: "#999",
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },
  message: {
    maxWidth: "85%",
    padding: "8px 12px",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  messageRole: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 4,
    color: "#666",
  },
  messageContent: {
    fontSize: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.5,
  },
  error: {
    margin: "8px 16px",
    padding: "8px 12px",
    background: "#ffebee",
    color: "#c62828",
    borderRadius: 4,
    fontSize: 12,
  },
  privacyNote: {
    padding: "6px 16px",
    fontSize: 10,
    color: "#aaa",
    textAlign: "center",
  },
  inputSection: {
    padding: "12px 16px",
    borderTop: "1px solid #e0e0e0",
    background: "#fafafa",
  },
  textarea: {
    width: "100%",
    padding: 8,
    fontSize: 13,
    border: "1px solid #ccc",
    borderRadius: 4,
    resize: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  inputButtons: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    justifyContent: "flex-end",
  },
  sendBtn: {
    padding: "6px 16px",
    fontSize: 13,
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  clearBtn: {
    padding: "6px 12px",
    fontSize: 12,
    background: "transparent",
    color: "#888",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
  },
};
