import { useState, useCallback, useRef, useEffect } from "react";
import type { PageContext, ChatMessage } from "../lib/pageTypes";
import { extractPageContext } from "../lib/messaging";
import { truncateMarkdown } from "../lib/truncate";
import { callAIDirect } from "../lib/aiClient";

const STORAGE_KEYS = {
  apiKey: "aiPageReader_apiKey",
  baseURL: "aiPageReader_baseURL",
  model: "aiPageReader_model",
  useBackend: "aiPageReader_useBackend",
  serverUrl: "aiPageReader_serverUrl",
  maxContext: "aiPageReader_maxContext",
};

export function SidePanelApp() {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Config state
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-chat");
  const [useBackend, setUseBackend] = useState(false);
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [maxContextChars, setMaxContextChars] = useState(30000);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved config
  useEffect(() => {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), (result) => {
      if (result[STORAGE_KEYS.apiKey]) setApiKey(result[STORAGE_KEYS.apiKey]);
      if (result[STORAGE_KEYS.baseURL]) setBaseURL(result[STORAGE_KEYS.baseURL]);
      if (result[STORAGE_KEYS.model]) setModel(result[STORAGE_KEYS.model]);
      if (result[STORAGE_KEYS.useBackend] !== undefined)
        setUseBackend(result[STORAGE_KEYS.useBackend]);
      if (result[STORAGE_KEYS.serverUrl])
        setServerUrl(result[STORAGE_KEYS.serverUrl]);
      if (result[STORAGE_KEYS.maxContext])
        setMaxContextChars(result[STORAGE_KEYS.maxContext]);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist config changes
  const persist = useCallback((key: string, value: string | number | boolean) => {
    chrome.storage.local.set({ [key]: value });
  }, []);

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
    try {
      const truncatedContext = pageContext
        ? {
            ...pageContext,
            markdown: truncateMarkdown(pageContext.markdown, maxContextChars),
            plainText: truncateMarkdown(pageContext.plainText, maxContextChars),
          }
        : null;

      let answer: string;

      if (useBackend) {
        const res = await fetch(`${serverUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageContext: truncatedContext,
            messages: newMessages,
            question,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        answer = data.answer;
      } else {
        if (!apiKey) {
          throw new Error(
            "API key not configured. Click the gear icon to set it in Settings."
          );
        }
        answer = await callAIDirect(
          truncatedContext,
          newMessages,
          question,
          { apiKey, baseURL, model },
          maxContextChars
        );
      }

      const assistantMsg: ChatMessage = { role: "assistant", content: answer };
      setMessages([...newMessages, assistantMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Cannot connect. Check your network or the server URL.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [
    input, messages, pageContext, maxContextChars,
    apiKey, baseURL, model, useBackend, serverUrl,
  ]);

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
            <label style={styles.settingLabel}>Connection mode</label>
            <select
              value={useBackend ? "backend" : "direct"}
              onChange={(e) => {
                const v = e.target.value === "backend";
                setUseBackend(v);
                persist(STORAGE_KEYS.useBackend, v);
              }}
              style={styles.settingSelect}
            >
              <option value="direct">Direct API (no backend needed)</option>
              <option value="backend">Proxy via backend server</option>
            </select>
          </div>

          {useBackend ? (
            <div style={styles.settingGroup}>
              <label style={styles.settingLabel}>Backend URL</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  persist(STORAGE_KEYS.serverUrl, e.target.value);
                }}
                style={styles.settingInput}
              />
            </div>
          ) : (
            <>
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
            </>
          )}

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
        </div>
      )}

      {/* Page info */}
      <div style={styles.pageSection}>
        {pageContext ? (
          <>
            <div style={styles.pageTitle}>{pageContext.title}</div>
            <div style={styles.pageUrl}>{pageContext.url}</div>
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
            {showPreview ? "Hide Preview" : "Show Preview"} (Markdown)
          </button>
          {showPreview && (
            <pre style={styles.previewContent}>{previewMarkdown}</pre>
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
            <div style={styles.messageContent}>Thinking...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Privacy note */}
      <div style={styles.privacyNote}>
        {useBackend
          ? `Page content → ${serverUrl} → AI API`
          : `Page content sent directly to ${baseURL}`}
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
    fontSize: 14, fontWeight: 600, marginBottom: 4, wordBreak: "break-word",
  },
  pageUrl: {
    fontSize: 11, color: "#888", wordBreak: "break-all", marginBottom: 8,
  },
  noPageText: { fontSize: 13, color: "#999", marginBottom: 8 },
  primaryBtn: {
    padding: "6px 14px", fontSize: 13, background: "#1976d2",
    color: "#fff", border: "none", borderRadius: 4, cursor: "pointer",
  },
  previewSection: {
    padding: "8px 16px", borderBottom: "1px solid #e0e0e0",
  },
  previewToggle: {
    fontSize: 12, background: "none", border: "none",
    color: "#1976d2", cursor: "pointer", padding: 0, marginBottom: 8,
  },
  previewContent: {
    fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word",
    maxHeight: 300, overflow: "auto", background: "#fafafa",
    padding: 8, borderRadius: 4, border: "1px solid #eee",
  },
  chatSection: {
    flex: 1, overflow: "auto", padding: "12px 16px",
    display: "flex", flexDirection: "column", gap: 8,
  },
  chatPlaceholder: {
    color: "#999", fontSize: 13, textAlign: "center", marginTop: 40,
  },
  message: {
    maxWidth: "85%", padding: "8px 12px", borderRadius: 8,
    alignSelf: "flex-start",
  },
  messageRole: {
    fontSize: 11, fontWeight: 600, marginBottom: 4, color: "#666",
  },
  messageContent: {
    fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word",
    lineHeight: 1.5,
  },
  error: {
    margin: "8px 16px", padding: "8px 12px",
    background: "#ffebee", color: "#c62828", borderRadius: 4, fontSize: 12,
  },
  privacyNote: {
    padding: "6px 16px", fontSize: 10, color: "#aaa", textAlign: "center",
  },
  inputSection: {
    padding: "12px 16px", borderTop: "1px solid #e0e0e0", background: "#fafafa",
  },
  textarea: {
    width: "100%", padding: 8, fontSize: 13, border: "1px solid #ccc",
    borderRadius: 4, resize: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  },
  inputButtons: {
    display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end",
  },
  sendBtn: {
    padding: "6px 16px", fontSize: 13, background: "#1976d2",
    color: "#fff", border: "none", borderRadius: 4, cursor: "pointer",
  },
  clearBtn: {
    padding: "6px 12px", fontSize: 12, background: "transparent",
    color: "#888", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer",
  },
};
