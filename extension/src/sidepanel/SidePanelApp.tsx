import { useState, useCallback, useRef, useEffect } from "react";
import type { PageContext, ChatMessage } from "../lib/pageTypes";
import { extractPageContext } from "../lib/messaging";
import type { ExtractMode } from "../lib/extract";
import { truncateMarkdown } from "../lib/truncate";
import { callAIDirect, type ImageData, type ApiFormat } from "../lib/aiClient";
import { renderMarkdown } from "../lib/markdown";
import {
  loadAllHistory,
  loadHistory,
  saveHistory,
  deleteHistory,
  type HistoryEntry,
} from "../lib/history";
import {
  loadPrompts,
  savePrompts,
  type SavedPrompt,
} from "../lib/prompts";

const STORAGE_KEYS = {
  apiKey: "aiPageReader_apiKey",
  baseURL: "aiPageReader_baseURL",
  model: "aiPageReader_model",
  apiFormat: "aiPageReader_apiFormat",
  extractMode: "aiPageReader_extractMode",
  maxContext: "aiPageReader_maxContext",
  maxImages: "aiPageReader_maxImages",
};

const DEFAULT_MAX_IMAGES = 5;

export function SidePanelApp() {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [restoredMsg, setRestoredMsg] = useState("");
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editPromptTitle, setEditPromptTitle] = useState("");
  const [editPromptContent, setEditPromptContent] = useState("");

  // Config state
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [model, setModel] = useState("qwen3.6-plus");
  const [apiFormat, setApiFormat] = useState<ApiFormat>("openai");
  const [extractMode, setExtractMode] = useState<ExtractMode>("auto");
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
      if (result[STORAGE_KEYS.extractMode])
        setExtractMode(result[STORAGE_KEYS.extractMode] as ExtractMode);
      if (result[STORAGE_KEYS.maxContext])
        setMaxContextChars(result[STORAGE_KEYS.maxContext]);
      if (result[STORAGE_KEYS.maxImages] !== undefined)
        setMaxImages(result[STORAGE_KEYS.maxImages]);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save conversation to history whenever messages change
  useEffect(() => {
    if (pageContext && messages.length > 0) {
      saveHistory({
        url: pageContext.url,
        title: pageContext.title,
        pageContext,
        messages,
        updatedAt: Date.now(),
      });
      // Refresh history list
      loadAllHistory().then(setHistoryList);
    }
  }, [messages, pageContext]);

  const persist = useCallback(
    (key: string, value: string | number | boolean) => {
      chrome.storage.local.set({ [key]: value });
    },
    []
  );

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setError("");
    setRestoredMsg("");
    try {
      const ctx = await extractPageContext(extractMode);

      // Check if we have a previous conversation for this page
      const existing = await loadHistory(ctx.url);
      if (existing && existing.messages.length > 0) {
        setPageContext(existing.pageContext);
        setMessages(existing.messages);
        setRestoredMsg(
          `Restored previous session (${existing.messages.length} messages)`
        );
      } else {
        setPageContext(ctx);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract page");
      setPageContext(null);
    } finally {
      setExtracting(false);
    }
  }, [extractMode]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question) return;
    setInput("");
    setError("");

    const userMsg: ChatMessage = { role: "user", content: question };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    setLoading(true);

    // Add a placeholder assistant message that will be filled by streaming
    const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };
    const messagesWithPlaceholder = [...newMessages, assistantPlaceholder];
    setMessages(messagesWithPlaceholder);

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

      // Use canvas-encoded images from content script (no CORS, instant)
      const images: ImageData[] = (pageContext?.encodedImages || [])
        .slice(0, maxImages)
        .map((img) => ({
          url: img.url,
          base64: img.base64,
          mediaType: img.mediaType,
        }));

      await callAIDirect(
        truncatedContext,
        newMessages,
        question,
        { apiKey, baseURL, model, apiFormat },
        maxContextChars,
        images,
        // Streaming callback: update the last message incrementally
        (chunk: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return updated;
          });
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Cannot connect. Check your network or the API Base URL.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
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

  const previewMaxChars = 50000;
  const previewMarkdown = pageContext
    ? truncateMarkdown(pageContext.markdown, previewMaxChars)
    : "";

  const imageCount = pageContext?.images?.length || 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Web Chat</h1>
        <div style={styles.headerBtns}>
          <button
            onClick={() => {
              setShowPrompts(!showPrompts);
              setShowHistory(false);
              setShowSettings(false);
              loadPrompts().then(setPrompts);
            }}
            style={{
              ...styles.settingsBtn,
              background: showPrompts ? "#e3f2fd" : undefined,
            }}
            title="Prompt Shortcuts"
          >
            📋
          </button>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setShowSettings(false);
              setShowPrompts(false);
              loadAllHistory().then(setHistoryList);
            }}
            style={{
              ...styles.settingsBtn,
              background: showHistory ? "#e3f2fd" : undefined,
            }}
            title="History"
          >
            🕓
          </button>
          <button
            onClick={() => {
              setShowSettings(!showSettings);
              setShowHistory(false);
              setShowPrompts(false);
            }}
            style={{
              ...styles.settingsBtn,
              background: showSettings ? "#e3f2fd" : undefined,
            }}
            title="Settings"
          >
            {showSettings ? "✕" : "⚙"}
          </button>
        </div>
      </div>

      {/* Prompt shortcuts panel */}
      {showPrompts && (
        <div style={styles.promptPanel}>
          <div style={styles.promptTitle}>Prompt Shortcuts</div>
          {prompts.map((prompt) => {
            const isEditing = editingPromptId === prompt.id;
            return (
              <div key={prompt.id} style={styles.promptItem}>
                {isEditing ? (
                  <div style={styles.promptEditWrap}>
                    <input
                      value={editPromptTitle}
                      onChange={(e) => setEditPromptTitle(e.target.value)}
                      style={styles.promptEditTitle}
                      placeholder="Shortcut name"
                    />
                    <textarea
                      value={editPromptContent}
                      onChange={(e) => setEditPromptContent(e.target.value)}
                      style={styles.promptEditContent}
                      rows={3}
                      placeholder="Prompt text..."
                    />
                    <div style={styles.promptEditBtns}>
                      <button
                        onClick={async () => {
                          const updated = prompts.map((p) =>
                            p.id === prompt.id
                              ? {
                                  ...p,
                                  title:
                                    editPromptTitle.trim() || p.title,
                                  content:
                                    editPromptContent.trim() || p.content,
                                }
                              : p
                          );
                          await savePrompts(updated);
                          setPrompts(updated);
                          setEditingPromptId(null);
                        }}
                        style={styles.promptSaveBtn}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPromptId(null)}
                        style={styles.promptCancelBtn}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={styles.promptItemMain}
                      onClick={() => {
                        setInput(prompt.content);
                        setShowPrompts(false);
                      }}
                    >
                      <div style={styles.promptItemTitle}>{prompt.title}</div>
                      <div style={styles.promptItemPreview}>
                        {prompt.content.slice(0, 80)}
                        {prompt.content.length > 80 ? "..." : ""}
                      </div>
                    </div>
                    <div style={styles.promptItemBtns}>
                      <button
                        style={styles.promptEditBtn}
                        onClick={() => {
                          setEditingPromptId(prompt.id);
                          setEditPromptTitle(prompt.title);
                          setEditPromptContent(prompt.content);
                        }}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        style={styles.promptDeleteBtn}
                        onClick={async () => {
                          const updated = prompts.filter(
                            (p) => p.id !== prompt.id
                          );
                          await savePrompts(updated);
                          setPrompts(updated);
                        }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <button
            style={styles.promptAddBtn}
            onClick={async () => {
              const newPrompt: SavedPrompt = {
                id: Date.now().toString(),
                title: "New Prompt",
                content: "",
              };
              const updated = [...prompts, newPrompt];
              await savePrompts(updated);
              setPrompts(updated);
            }}
          >
            + Add Prompt
          </button>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div style={styles.historyPanel}>
          <div style={styles.historyTitle}>
            Saved Conversations ({historyList.length})
          </div>
          {historyList.length === 0 && (
            <div style={styles.historyEmpty}>
              No saved conversations yet. Chat history is saved automatically.
            </div>
          )}
          {historyList.slice(0, 20).map((entry) => (
            <div
              key={entry.url}
              style={{
                ...styles.historyItem,
                background:
                  pageContext?.url === entry.url ? "#e3f2fd" : undefined,
              }}
            >
              <div
                style={styles.historyItemMain}
                onClick={async () => {
                  setPageContext(entry.pageContext);
                  setMessages(entry.messages);
                  setShowHistory(false);
                  setRestoredMsg(
                    `Restored: ${entry.messages.length} messages from ${new Date(entry.updatedAt).toLocaleString()}`
                  );
                }}
              >
                <div style={styles.historyItemTitle}>{entry.title}</div>
                <div style={styles.historyItemUrl}>{entry.url}</div>
                <div style={styles.historyItemMeta}>
                  {entry.messages.length} messages ·{" "}
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                style={styles.historyDelete}
                onClick={async (e) => {
                  e.stopPropagation();
                  await deleteHistory(entry.url);
                  loadAllHistory().then(setHistoryList);
                  if (pageContext?.url === entry.url) {
                    setMessages([]);
                  }
                }}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
            <label style={styles.settingLabel}>Extract mode</label>
            <select
              value={extractMode}
              onChange={(e) => {
                const v = e.target.value as ExtractMode;
                setExtractMode(v);
                persist(STORAGE_KEYS.extractMode, v);
              }}
              style={styles.settingSelect}
            >
              <option value="auto">Auto (smart)</option>
              <option value="readability">Readability</option>
              <option value="fullpage">Full page</option>
              <option value="plaintext">Plain text</option>
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
            {restoredMsg && (
              <div style={styles.restoredMsg}>{restoredMsg}</div>
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
            {pageContext.markdown.length > 0
              ? ` ${pageContext.markdown.length.toLocaleString()} chars`
              : ""}
            {imageCount > 0 ? ` + ${imageCount} images` : ""})
          </button>
          {showPreview && (
            <>
              {imageCount > 0 && (
                <div style={styles.imagePreviewGrid}>
                  {pageContext.images.slice(0, maxImages).map((img, i) => (
                    <div
                      key={i}
                      style={styles.imageThumbWrap}
                      title={`Image ${i + 1}: ${img.alt || ""}`}
                      onClick={() => setLightboxUrl(img.url)}
                    >
                      <span style={styles.imageNumber}>{i + 1}</span>
                      <img
                        src={img.url}
                        alt={img.alt || `Image ${i + 1}`}
                        style={styles.imageThumb}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          ((e.target as HTMLImageElement)
                            .previousSibling as HTMLElement).style.display =
                            "none";
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div
                style={styles.previewContent}
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(previewMarkdown),
                }}
              />
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
            {msg.role === "assistant" ? (
              <div
                style={styles.messageContent}
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(msg.content),
                }}
              />
            ) : (
              <div style={styles.messageContent}>{msg.content}</div>
            )}
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div style={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <button
            style={styles.lightboxClose}
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            style={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
  headerBtns: { display: "flex", gap: 6 },
  settingsBtn: {
    background: "none",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 14,
    cursor: "pointer",
    padding: "2px 8px",
    lineHeight: "20px",
  },
  historyPanel: {
    padding: "8px 16px",
    borderBottom: "1px solid #e0e0e0",
    background: "#fafafa",
    maxHeight: 300,
    overflow: "auto",
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  historyEmpty: {
    fontSize: 12,
    color: "#aaa",
    fontStyle: "italic",
  },
  historyItem: {
    display: "flex",
    alignItems: "flex-start",
    padding: "6px 8px",
    marginBottom: 4,
    borderRadius: 4,
    border: "1px solid #eee",
    background: "#fff",
  },
  historyItemMain: {
    flex: 1,
    cursor: "pointer",
    overflow: "hidden",
  },
  historyItemTitle: {
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyItemUrl: {
    fontSize: 10,
    color: "#888",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: 2,
  },
  historyItemMeta: {
    fontSize: 10,
    color: "#aaa",
    marginTop: 2,
  },
  historyDelete: {
    background: "none",
    border: "none",
    color: "#ccc",
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 4px",
    flexShrink: 0,
  },
  restoredMsg: {
    fontSize: 11,
    color: "#2e7d32",
    background: "#e8f5e9",
    padding: "4px 8px",
    borderRadius: 4,
    marginBottom: 8,
  },
  promptPanel: {
    padding: "8px 16px",
    borderBottom: "1px solid #e0e0e0",
    background: "#fafafa",
    maxHeight: 320,
    overflow: "auto",
  },
  promptTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  promptItem: {
    display: "flex",
    alignItems: "flex-start",
    padding: "6px 8px",
    marginBottom: 4,
    borderRadius: 4,
    border: "1px solid #eee",
    background: "#fff",
  },
  promptItemMain: {
    flex: 1,
    cursor: "pointer",
    overflow: "hidden",
  },
  promptItemTitle: {
    fontSize: 12,
    fontWeight: 600,
  },
  promptItemPreview: {
    fontSize: 10,
    color: "#888",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: 2,
  },
  promptItemBtns: {
    display: "flex",
    gap: 2,
    flexShrink: 0,
    marginLeft: 6,
  },
  promptEditBtn: {
    background: "none",
    border: "none",
    color: "#aaa",
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 4px",
  },
  promptDeleteBtn: {
    background: "none",
    border: "none",
    color: "#ccc",
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 4px",
  },
  promptEditWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  promptEditTitle: {
    padding: "3px 6px",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 3,
  },
  promptEditContent: {
    padding: "4px 6px",
    fontSize: 11,
    border: "1px solid #ccc",
    borderRadius: 3,
    resize: "vertical",
    fontFamily: "inherit",
  },
  promptEditBtns: {
    display: "flex",
    gap: 6,
    justifyContent: "flex-end",
  },
  promptSaveBtn: {
    padding: "3px 10px",
    fontSize: 11,
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
  },
  promptCancelBtn: {
    padding: "3px 8px",
    fontSize: 11,
    background: "transparent",
    color: "#888",
    border: "1px solid #ccc",
    borderRadius: 3,
    cursor: "pointer",
  },
  promptAddBtn: {
    width: "100%",
    padding: "6px",
    fontSize: 12,
    background: "transparent",
    color: "#1976d2",
    border: "1px dashed #ccc",
    borderRadius: 4,
    cursor: "pointer",
    marginTop: 4,
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
    maxHeight: 500,
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
    cursor: "pointer",
    position: "relative",
  },
  imageNumber: {
    position: "absolute",
    top: 2,
    left: 2,
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    zIndex: 1,
  },
  imageThumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  lightbox: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.92)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    cursor: "pointer",
  },
  lightboxClose: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(255,255,255,0.25)",
    color: "#fff",
    border: "none",
    fontSize: 22,
    width: 40,
    height: 40,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  lightboxImg: {
    maxWidth: "90%",
    maxHeight: "90%",
    objectFit: "contain",
    cursor: "default",
    background: "#fff",
    borderRadius: 4,
    padding: 4,
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
