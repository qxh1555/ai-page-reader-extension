# AI Page Reader - Chrome Extension

A Chrome extension that extracts web page content as Markdown and lets you ask AI questions about it in the side panel.

## Architecture

```
extension/          Chrome Extension (Manifest V3, TypeScript, React, Vite)
server/             Node.js backend (optional) - proxy for AI API calls
```

## Quick Start (Recommended: Direct API)

No backend needed. Just build the extension and set your API key in the settings panel.

### 1. Build the extension

```bash
cd extension
npm install
npm run build
```

### 2. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `extension/dist/`

### 3. Configure

1. Click the AI Page Reader icon in the toolbar
2. Click the gear icon in the side panel header
3. Set **Connection mode** to "Direct API"
4. Fill in your API key, Base URL, and Model

   | Provider | Base URL | Model |
   |---|---|---|
   | DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
   | Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` |
   | Custom (Ollama, etc.) | your endpoint | your model |

5. Click the gear icon again to close settings

### 4. Use

1. Open any web page
2. Click the AI Page Reader icon → side panel opens
3. Click "Read Page" to extract content
4. Ask questions in the chat input

## Alternative: Backend Proxy Mode

If you prefer to keep your API key on a local server:

```bash
cd server
cp .env.example .env
# Edit .env with your API key and provider
npm install
npm run dev
```

Then in the extension settings, switch **Connection mode** to "Proxy via backend server".

## Project Structure

```
extension/
  package.json / vite.config.ts / tsconfig.json
  public/
    manifest.json
  src/
    background.ts           # Service worker
    sidepanel/
      SidePanelApp.tsx      # Main React UI
      main.tsx / sidepanel.html
    content/
      extractPage.ts        # Page extraction (Readability + Turndown)
    lib/
      pageTypes.ts          # Shared types
      messaging.ts          # Chrome messaging
      aiClient.ts           # Direct API client (browser-side)
      truncate.ts           # Markdown truncation

server/                     # Optional backend
  package.json / tsconfig.json / .env.example
  src/
    index.ts                # Express server
    ai/
      anthropicClient.ts    # AI client (Anthropic SDK)
      types.ts
    utils/truncate.ts
```

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Access current page on user click |
| `scripting` | Inject page extraction script |
| `sidePanel` | Display chat UI in side panel |
| `storage` | Save settings (API key, model, etc.) |
| `host_permissions` | Access http/https page content |

## Privacy

- Page content is only sent when you click "Read Page" and "Send"
- In Direct API mode: content goes directly from your browser to the AI provider
- In Backend mode: content goes to `localhost` first, then to the AI provider
- API key is stored in Chrome's local storage (not synced to your Google account)
