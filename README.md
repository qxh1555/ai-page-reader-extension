<p align="center">
  <img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white" alt="TS">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Vite-5.3-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

<h1 align="center">Web Chat</h1>
<h3 align="center">Your AI Webpage Assistant</h3>

<p align="center">
  <strong>边看网页，边问 AI。</strong><br>
  打开任意网页，在侧边栏中和 AI 一起阅读、提问、理解。<br>
  支持文字提取、图片识别、对话存档、流式输出。
</p>

---

## ✨ 亮点

<table>
<tr>
<td width="50%">

### 精准提取，自由控制

四种提取模式随意切换，从算法选优到全文去噪，不同页面选不同策略。

- **Auto** — 智能选择最优策略
- **Readability** — 博客/新闻精准提取
- **Full Page** — SPA 页面全文抓取
- **Plain Text** — 保底纯文本

> *再也不用复制粘贴网页内容了*

</td>
<td width="50%">

### 图片识别，视觉问答

自动采集页面图片，下载转码后发送给 Vision 模型。AI 可以"看懂"图表、截图、公式，回答关于图片内容的问题。

- 自动过滤头像、图标等噪音
- 缩略图预览 + 点击放大
- 图片编号，对话中可直接引用 *"Image 2 讲了什么？"*

> *支持 DeepSeek-VL、Qwen-VL、GPT-4V 等视觉模型*

</td>
</tr>
<tr>
<td width="50%">

### 对话存档，随时回顾

每个网页的对话自动保存，再次打开同一页面时一键恢复历史记录。

- 按 URL 自动归档，无需手动管理
- 历史面板统一浏览所有保存的对话
- 切换网页即切换上下文

> *看过的好文章，对话永远不丢*

</td>
<td width="50%">

### 流式输出，逐字呈现

基于 SSE (Server-Sent Events)，AI 的回答像打字一样逐字出现，不用等待完整响应。

- 兼容 Anthropic Messages & OpenAI Chat Completions
- 零配置切换 API 格式
- 支持任意兼容端点

> *打字机体验，看到第一行就能开始读*

</td>
</tr>
</table>

---

## 快速开始

### 方式一：直接下载（推荐）

下载 `extension/dist/` 目录，在 Chrome 中加载即可，无需安装任何开发工具。

打开 `chrome://extensions/` → 开启 **开发者模式** → **加载已解压的扩展程序** → 选择 `dist/` 目录

### 方式二：自行构建

```bash
cd extension
npm install
npm run build
```

产物在 `extension/dist/`，同上加载。

### 配置

打开任意网页 → 点击侧边栏齿轮图标 → 填入 API 信息 → 完成

---

## 配置参考

### 推荐：阿里云百炼（支持多模态）

> **DeepSeek API 目前尚未提供图像识别能力。** 如需使用图片识别功能，推荐阿里云百炼平台的 Qwen 系列模型。

| 设置 | 值 |
|---|---|
| Base URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Model | `qwen3.6-plus` |
| API Format | OpenAI Compatible |
| API Key | [阿里云百炼控制台](https://bailian.console.aliyun.com) 申请 |

### 其他提供商

| 提供商 | Base URL | 推荐模型 | API Format | 图片识别 |
|---|---|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-pro` | OpenAI | 暂不支持 |
| DeepSeek | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro` | Anthropic | 暂不支持 |
| Anthropic 官方 | `https://api.anthropic.com` | `claude-sonnet-4-6` | Anthropic | 支持 |
| OpenAI 官方 | `https://api.openai.com/v1` | `gpt-4o` | OpenAI | 支持 |
| Ollama 本地 | `http://localhost:11434` | 你的模型名 | OpenAI | 取决于模型 |

### 提取模式

| 模式 | 场景 | 说明 |
|---|---|---|
| **Auto** | 通用 | 先 Readability，不够自动降级 |
| **Readability** | 博客、新闻 | 算法精准定位正文 |
| **Full Page** | SPA、论坛 | 全页去噪提取 |
| **Plain Text** | 兜底 | 直接采集 DOM 文本 |

### 其他设置

| 设置 | 默认 | 说明 |
|---|---|---|
| API Key | — | 密钥仅存本地 |
| Base URL | `dashscope.aliyuncs.com/.../v1` | 默认百炼，可配任意端点 |
| Model | `qwen3.6-plus` | 支持多模态，推荐 |
| API Format | OpenAI Compatible | 也支持 Anthropic Messages |
| Max Context | 30,000 | 超出截断 |
| Max Images | 5 | 0-20，每张 ≤5MB |

---

## 功能全景

```
┌─────────────────────────────────────────────────────┐
│                    Web Chat                          │
│              Your AI Webpage Assistant               │
├─────────────────────────────────────────────────────┤
│                                                      │
│  📄 内容提取          🖼️ 图片识别                     │
│  ├─ 4 种提取模式      ├─ 自动采集页面图片              │
│  ├─ Markdown 预览     ├─ 缩略图 + 点击放大             │
│  └─ 字符数实时显示    └─ 编号引用，精准提问             │
│                                                      │
│  💬 智能对话          ⚡ 流式输出                      │
│  ├─ 多轮上下文记忆    ├─ 逐字实时呈现                   │
│  ├─ Markdown 渲染     ├─ 支持 Anthropic + OpenAI       │
│  └─ AI 可引用图片     └─ 任意兼容端点                   │
│                                                      │
│  💾 对话存档          🔒 隐私安全                      │
│  ├─ 按 URL 自动归档   ├─ Key 仅存本地                   │
│  ├─ 历史面板浏览      ├─ 用户主动触发才发送              │
│  └─ 一键恢复历史      └─ 直接到 AI，不经过第三方         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 隐私

- API Key 存储在 `chrome.storage.local`，仅存本地，不同步
- 页面内容仅在点击 **Read Page** + **Send** 后才发送
- 数据直接从浏览器到 AI 提供商，无中间服务器

---

## 技术栈

```
React 18 + TypeScript + Vite
Chrome Extension Manifest V3
marked (Markdown 渲染)
@mozilla/readability (正文提取)
turndown (HTML → Markdown)
```

---

## 许可

MIT License
