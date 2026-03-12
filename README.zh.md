# Build Your Own OpenClaw

[English](README.md) | 中文

**用 ~2,600 行 TypeScript 从零构建一个OpenClaw。**

你是否好奇过 [OpenClaw](https://github.com/anthropics/openclaw) 这样的 AI 助手是怎么同时接入飞书、Telegram 等多个平台的？消息路由、Agent 工具调用循环、通道抽象又是怎么实现的？

本教程通过构建 **MyClaw**（一个教学用的 OpenClaw 最小实现）来回答这些问题。12 章教程，每章聚焦一个核心模块，带你从零实现一个可运行的多通道 AI 助手。

### 你将学到什么

- **通道抽象** — 如何设计统一接口，让一套代码同时服务 Terminal、飞书、Telegram 等多个平台
- **Agent 运行时** — LLM 调用、Tool Use 循环、对话历史管理的完整实现
- **消息路由** — 基于规则将不同通道的消息分发到不同 Agent/Provider
- **配置系统** — Zod Schema 验证 + YAML 配置的工程实践
- **WebSocket 网关** — 带认证和会话管理的实时通信服务
- **Skills 系统** — 基于 Markdown 的 prompt 管理，斜杠命令调用
- **插件架构** — 控制反转（IoC）模式的实际应用

### 适合谁

- 想深入理解 AI 助手/Agent 架构的开发者
- 想学习 TypeScript 工程实践的中级开发者
- 想为自己的项目构建多通道消息网关的工程师

## 特性

- **多通道** — Terminal + 飞书 + Telegram，统一抽象可轻松扩展
- **多 LLM** — Anthropic (Claude)、OpenAI (GPT-4o)、OpenRouter (免费模型可用)
- **Coding Agent** — 基于 pi-coding-agent 的内置工具集 (read/write/edit/bash)，支持多轮 Tool Use
- **Skills 系统** — 通过 SKILL.md 定义技能，`/skill-name` 斜杠命令调用
- **消息路由** — 规则引擎，灵活映射通道到 Agent
- **WebSocket 网关** — 统一 API 控制面
- **插件系统** — 可扩展的运行时插件
- **开箱即用** — `onboard` 引导配置，`doctor` 健康诊断

---

## 教程章节

本教程共 12 章，每章聚焦一个核心模块。建议按顺序阅读，每章都附有完整的代码实现和设计解析。

| 章节 | 主题 | 你将学到 | 关键文件 |
|------|------|----------|----------|
| [01](docs/01-project-setup.md) | 项目初始化 | TypeScript + ESM 项目搭建 | `package.json`, `tsconfig.json`, `myclaw.mjs` |
| [02](docs/02-cli-framework.md) | CLI 框架 | Commander.js 命令系统、依赖注入 | `src/cli/program.ts`, `src/entry.ts` |
| [03](docs/03-configuration.md) | 配置系统 | Zod Schema 验证、YAML 配置管理 | `src/config/schema.ts`, `src/config/loader.ts` |
| [04](docs/04-gateway-server.md) | 网关服务器 | WebSocket 服务、会话管理、认证 | `src/gateway/server.ts`, `src/gateway/protocol.ts` |
| [05](docs/05-agent-runtime.md) | Agent 运行时 | LLM 抽象、Agent Loop、InteractiveMode TUI | `src/agent/runtime.ts`, `src/agent/model.ts`, `src/cli/commands/agent.ts` |
| [06](docs/06-channels.md) | 通道抽象 | 接口设计、EventEmitter、多态 | `src/channels/transport.ts`, `src/channels/terminal.ts` |
| [07](docs/07-message-routing.md) | 消息路由 | 分层匹配、多 Agent 调度 | `src/routing/router.ts` |
| [08](docs/08-feishu.md) | 飞书通道 | 外部平台集成、WebSocket 长连接 | `src/channels/feishu.ts` |
| [08b](docs/08b-telegram.md) | Telegram 通道 | grammY 集成、Long Polling、消息分块 | `src/channels/telegram.ts` |
| [09](docs/09-plugins.md) | 插件系统 | 控制反转、运行时扩展 | `src/plugins/registry.ts` |
| [09b](docs/09b-skills.md) | Skills 系统 | SKILL.md 定义、斜杠命令、prompt 管理 | `src/skills/loader.ts`, `src/skills/registry.ts` |
| [10](docs/10-final.md) | 整合运行 | 端到端调试、完整数据流 | 全部 |

## 项目结构

```
build-your-own-openclaw/
├── myclaw.mjs                 # 启动入口（版本检查 + 加载）
├── package.json               # 依赖和脚本
├── tsconfig.json              # TypeScript 配置
├── skills/                    # 内置 Skills
│   ├── translate/SKILL.md     # 翻译 Skill
│   └── summarize/SKILL.md     # 总结 Skill
├── src/
│   ├── entry.ts               # 主入口
│   ├── cli/
│   │   ├── program.ts         # CLI 程序构建器
│   │   ├── register.ts        # 命令注册
│   │   └── commands/
│   │       ├── gateway.ts     # gateway 命令
│   │       ├── agent.ts       # agent 命令
│   │       ├── onboard.ts     # 引导配置命令
│   │       ├── doctor.ts      # 诊断命令
│   │       └── message.ts     # 消息命令
│   ├── config/
│   │   ├── schema.ts          # 配置 Schema (Zod)
│   │   ├── loader.ts          # 配置加载器
│   │   └── index.ts           # 导出
│   ├── gateway/
│   │   ├── server.ts          # WebSocket 网关服务器
│   │   ├── protocol.ts        # 消息协议定义
│   │   └── session.ts         # 会话管理
│   ├── agent/
│   │   ├── runtime.ts         # Agent 运行时（gateway 路径）
│   │   └── model.ts           # Model 解析（auth、registry、model 映射）
│   ├── channels/
│   │   ├── transport.ts       # 通道抽象基类
│   │   ├── terminal.ts        # 终端通道
│   │   ├── feishu.ts          # 飞书通道
│   │   ├── telegram.ts        # Telegram 通道
│   │   └── manager.ts         # 通道管理器
│   ├── routing/
│   │   └── router.ts          # 消息路由器
│   ├── skills/
│   │   ├── loader.ts          # Skill 加载器
│   │   └── registry.ts        # Skill 注册表
│   └── plugins/
│       └── registry.ts        # 插件注册表
└── docs/                      # 教程文档
```

## 与完整版 OpenClaw 的对比

| 特性 | MyClaw（本教程） | 完整版 OpenClaw |
|------|------------------|----------------|
| 代码量 | ~2,600 行 | ~921,000 行 |
| 通道 | 3（Terminal + 飞书 + Telegram） | 23+ |
| LLM 提供者 | 3（Anthropic + OpenAI + OpenRouter） | 10+ |
| 工具 | pi-coding-agent 内置工具集 | 50+ Skills, 40+ Extensions |
| 平台 | CLI only | CLI + macOS + iOS + Android |
| 协议 | 简单 JSON | TypeBox Schema 验证 |
| 安全 | 基础 Token 认证 | DM 配对、角色控制、操作审批 |
| 会话 | 内存存储 | 持久化 + 向量数据库 + RAG |

> 本教程覆盖了 OpenClaw 的核心架构模式。掌握这些模式后，你可以继续阅读 OpenClaw 的源码，或在此基础上扩展出自己的 AI 助手。

## 快速开始

### 环境要求

- **Node.js** >= 20
- 至少一个 LLM API Key：
  - `OPENROUTER_API_KEY`（默认，免费模型可用）
  - `ANTHROPIC_API_KEY`（推荐，Claude）
  - `OPENAI_API_KEY`（GPT-4o）

### 1. 克隆并安装

```bash
git clone https://github.com/anthropics/build-your-own-openclaw.git
cd build-your-own-openclaw
npm install
```

### 2. 配置

运行交互式引导，生成配置文件 `~/.myclaw/myclaw.yaml`：

```bash
npx myclaw onboard
```

引导过程会依次询问：LLM 提供者、API Key、模型名称、Gateway 端口、Bot 名称，以及是否启用飞书/Telegram 通道。

### 3. 开始聊天

```bash
# 在终端中直接与 AI 对话
npx myclaw agent
```

### 4. 启动 Gateway（可选）

Gateway 模式启动 WebSocket 服务器，并同时激活所有已配置的外部通道（飞书、Telegram 等）：

```bash
npx myclaw gateway
```

### 5. 运行诊断

```bash
npx myclaw doctor
```

### 接入飞书（可选）

```bash
export FEISHU_APP_ID="your_app_id"
export FEISHU_APP_SECRET="your_app_secret"
npx myclaw gateway
```

> 详见 [第 8 章：飞书通道](docs/08-feishu.md) 了解完整的飞书开放平台配置流程。

### 接入 Telegram（可选）

```bash
export TELEGRAM_BOT_TOKEN="your_bot_token"
npx myclaw gateway
```

> 详见 [第 8b 章：Telegram 通道](docs/08b-telegram.md) 了解如何通过 @BotFather 创建 Bot 并配置。

## License

MIT
