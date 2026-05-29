# AI Page Reader

> 边看网页边问 AI — 在 Chrome 侧边栏中阅读、提问、理解任何网页。

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-5.5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-18.3-61dafb" alt="React">
  <img src="https://img.shields.io/badge/Vite-5.3-646cff" alt="Vite">
</p>

---

## 它能做什么

打开任意网页，点击扩展图标，Chrome 右侧弹出侧边栏：

1. **提取正文** — 自动识别网页内容区，转为 Markdown
2. **图片识别** — 支持视觉模型，提取页面图片一并发送给 AI
3. **AI 问答** — 基于当前页面内容向 AI 提问，支持多轮对话
4. **多种格式** — 兼容 Anthropic Messages 和 OpenAI Chat Completions 两种 API
5. **API Key 自配** — 密钥仅存储在本地浏览器，不上传任何第三方

---

## 快速开始

### 1. 构建

```bash
cd extension
npm install
npm run build
```

### 2. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `extension/dist/` 目录

### 3. 配置 API

1. 打开任意网页，点击工具栏的 **AI Page Reader** 图标
2. 侧边栏右上角点击 **齿轮图标** 打开设置
3. 填入你的 API 信息（参考下方配置指南）
4. 关闭设置面板

### 4. 开始使用

1. 点击 **Read Page** 提取页面内容
2. 点击 **Show Preview** 可预览提取结果
3. 在输入框提问，按 Enter 发送

---

## 配置指南

### API 连接

| 设置 | 说明 | 示例值 |
|---|---|---|
| **API Key** | 你的 API 密钥 | `sk-...` |
| **Base URL** | API 端点地址 | `https://api.deepseek.com` |
| **Model** | 模型名称 | `deepseek-chat` |
| **API Format** | 请求格式 | `Anthropic Messages` 或 `OpenAI Compatible` |

### 常用提供商配置

| 提供商 | Base URL | Model 示例 | API Format |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` | Anthropic |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.6-plus` | OpenAI |
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` | Anthropic |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | OpenAI |
| Ollama (本地) | `http://localhost:11434` | `llama3` | OpenAI |

> **视觉模型提示**：如需图片识别功能，请使用支持 Vision 的模型（如 `qwen3.6-plus`、`gpt-4o`、`claude-sonnet-4-6`）。

### 提取模式

不同页面结构需要不同提取策略：

| 模式 | 适用场景 | 工作原理 |
|---|---|---|
| **Auto (smart)** | 通用，推荐默认使用 | 先尝试 Readability，内容不足时自动降级到全文提取 |
| **Readability** | 博客、新闻、文档等正文清晰的页面 | Mozilla Readability 算法，精准提取文章主体 |
| **Full page** | SPA 页面、学术论坛 (OpenReview 等) | 全页 HTML 去噪后转 Markdown |
| **Plain text** | 保底方案 | 从页面 DOM 直接采集纯文本 |

### 图片设置

| 设置 | 默认值 | 说明 |
|---|---|---|
| **Max images** | 5 | 发送给 AI 的最大图片数量，范围 0-20 |
| **Max context chars** | 30,000 | 发送给 AI 的文本字符上限，超出会截断 |

---

## 功能详解

### 图片支持

- 自动收集页面中尺寸 ≥ 80px 的图片
- 过滤掉头像、图标等小图
- 下载后以 base64 格式嵌入请求
- 图片按编号 `[Image 1]` `[Image 2]` 发送，AI 可精准引用
- 缩略图可点击放大查看

### 对话管理

- 支持多轮对话，AI 记住上下文
- 每次发送自动附带当前页面内容
- **Clear Chat** 清空对话历史

### 隐私

- API Key 保存在 `chrome.storage.local`，仅存本地
- 页面内容仅在点击 **Read Page** 和 **Send** 后才发送
- 内容直接从浏览器发送到 AI 提供商，不经第三方中转

---

## 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` | 用户点击后才可访问当前标签页 |
| `scripting` | 注入页面内容提取脚本 |
| `sidePanel` | 在 Chrome 侧边栏中显示 UI |
| `storage` | 本地保存设置和 API Key |
| `host_permissions` | 读取 http/https 页面内容和图片 |

---

## 项目结构

```
extension/
├── public/
│   └── manifest.json              # Chrome 扩展清单
├── src/
│   ├── background.ts              # Service Worker，处理图标点击
│   ├── sidepanel/
│   │   ├── SidePanelApp.tsx       # 侧边栏主界面
│   │   ├── main.tsx               # React 入口
│   │   └── sidepanel.html         # 侧边栏 HTML
│   ├── content/
│   │   └── extractPage.ts         # 内容提取脚本
│   └── lib/
│       ├── aiClient.ts            # AI API 客户端 (Anthropic + OpenAI)
│       ├── extract.ts             # 页面内容提取策略
│       ├── messaging.ts           # Chrome 消息通信
│       ├── pageTypes.ts           # TypeScript 类型定义
│       └── truncate.ts            # 文本截断工具
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 常见问题

### Q: 某些页面提取不到内容？

切换 **Extract mode** 到 `Full page` 或 `Plain text`。SPA 页面（如 OpenReview）的正文结构复杂，Readability 可能只提取到摘要区。

### Q: 图片发送失败 ("image format is illegal")？

检查模型是否支持 Vision（图片输入）。纯文本模型不接受图片。

### Q: 如何用本地模型 (Ollama)？

| 设置 | 值 |
|---|---|
| Base URL | `http://localhost:11434` |
| Model | 你拉取的模型名，如 `llama3.2-vision` |
| API Format | OpenAI Compatible |

> 注意：本地模型需支持 Vision 才能处理图片。

### Q: API Key 安全吗？

Key 存储在 Chrome 本地存储中，不会同步到 Google 账号，也不会发送到除你配置的 Base URL 之外的任何服务器。
