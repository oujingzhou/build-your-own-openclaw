# Chapter 10: 整合与运行

恭喜你走到了最后一章！在前面的 9 个章节中，我们从零开始构建了一个完整的多通道 AI Agent 系统 -- **MyClaw**。这是一个教学项目，旨在帮助你理解 OpenClaw 的内部架构和设计理念。现在让我们把所有的组件整合在一起，全面回顾系统的工作方式，并详细演示如何运行它。

---

## 完整数据流

当用户发送一条消息时，数据在 MyClaw 系统中经历了怎样的旅程？下面的 Mermaid 序列图展示了端到端的完整流程：

```mermaid
sequenceDiagram
    participant U as 用户
    participant CH as Channel<br/>(终端/飞书/WebSocket)
    participant GW as Gateway<br/>(WebSocket 网关)
    participant SM as SessionManager<br/>(会话管理)
    participant RT as Router<br/>(消息路由)
    participant AG as AgentRuntime<br/>(Agent 运行时)
    participant LLM as LLM Provider<br/>(Anthropic/OpenAI/OpenRouter)
    participant TL as Tools<br/>(read/write/exec/grep...)

    U->>CH: 发送消息 "帮我读取 package.json"
    CH->>GW: IncomingMessage { channelId, sessionId, text }
    GW->>SM: getOrCreate(channelId, sessionId)
    SM-->>GW: Session { id, history }
    GW->>SM: addMessage(sessionId, "user", text)
    GW->>RT: route({ channelId, sessionId, text, history })
    RT->>RT: 匹配路由规则 (精确匹配 → 通配符 → 报错)
    RT->>AG: chat({ providerId, messages })
    AG->>AG: buildSystemPrompt(config)
    AG->>LLM: 发送 messages + tools 定义
    LLM-->>AG: 返回 tool_calls: [read({file_path: "package.json"})]

    Note over AG,TL: Agent Loop: 工具调用循环

    AG->>TL: execute read({ file_path: "package.json" })
    TL-->>AG: 文件内容 (JSON)
    AG->>LLM: 发送 tool_result + 继续对话
    LLM-->>AG: 返回 text: "package.json 的内容如下..."

    Note over AG,LLM: finishReason != tool_calls → 循环结束

    AG-->>RT: "package.json 的内容如下..."
    RT-->>GW: response text
    GW->>SM: addMessage(sessionId, "assistant", response)
    GW-->>CH: GatewayResponse { type: "chat.response", text, done: true }
    CH-->>U: 显示回复
```

这个流程体现了 MyClaw 的核心设计哲学：**每个组件各司其职，通过清晰的接口协作**。Channel 负责收发消息、Router 负责路由决策、AgentRuntime 负责与 LLM 交互并执行工具、SessionManager 负责维护对话历史。

### Agent Loop 详解

AgentRuntime 中最关键的是 **Agent Loop**（智能体循环），它的工作方式如下：

```mermaid
flowchart TD
    A[收到用户消息] --> B[构建 system prompt + 拼接对话历史]
    B --> C[调用 LLM API]
    C --> D{LLM 返回了什么？}
    D -->|text 文本| E[返回文本给用户]
    D -->|tool_calls 工具调用| F[执行每个工具]
    F --> G[将工具结果加入消息历史]
    G --> H{已经执行了 10 轮？}
    H -->|否| C
    H -->|是| I[强制结束，返回已收集的文本]
    E --> J[完成]
    I --> J
```

通过 `MAX_TOOL_ROUNDS = 10` 的限制，系统防止了 LLM 无限调用工具的死循环。这是一个简单但重要的安全措施。

---

## 系统架构回顾

### 模块依赖关系图

下面的 Mermaid 图展示了 MyClaw 各模块之间的依赖关系，帮你建立对整体架构的直观理解：

```mermaid
graph TD
    ENTRY["entry.ts<br/>程序入口"]
    CLI["cli/program.ts<br/>CLI 框架"]
    REG["cli/register.ts<br/>命令注册"]

    CMD_AGENT["commands/agent.ts<br/>交互式聊天"]
    CMD_GW["commands/gateway.ts<br/>网关服务"]
    CMD_OB["commands/onboard.ts<br/>初始化向导"]
    CMD_DR["commands/doctor.ts<br/>诊断检查"]
    CMD_MSG["commands/message.ts<br/>单条消息"]

    CONFIG["config/schema.ts<br/>Zod Schema"]
    LOADER["config/loader.ts<br/>YAML 加载"]

    GW["gateway/server.ts<br/>WebSocket 网关"]
    SESS["gateway/session.ts<br/>会话管理"]
    PROTO["gateway/protocol.ts<br/>消息协议"]

    AGENT["agent/runtime.ts<br/>Agent 运行时"]
    TOOLS["agent/tools.ts<br/>内置工具"]
    PROV_A["agent/providers/anthropic.ts<br/>Anthropic Provider"]
    PROV_O["agent/providers/openai.ts<br/>OpenAI Provider"]
    TYPES["agent/providers/types.ts<br/>Provider 接口"]

    TRANS["channels/transport.ts<br/>Channel 抽象基类"]
    TERM["channels/terminal.ts<br/>终端通道"]
    FEISHU["channels/feishu.ts<br/>飞书通道"]
    MANAGER["channels/manager.ts<br/>通道管理器"]

    ROUTER["routing/router.ts<br/>消息路由器"]

    PLUGIN["plugins/registry.ts<br/>插件注册中心"]

    ENTRY --> CLI
    ENTRY --> REG
    REG --> CMD_AGENT
    REG --> CMD_GW
    REG --> CMD_OB
    REG --> CMD_DR
    REG --> CMD_MSG

    CMD_AGENT --> AGENT
    CMD_AGENT --> ROUTER
    CMD_AGENT --> TERM

    CMD_GW --> GW
    CMD_OB --> CONFIG
    CMD_OB --> LOADER
    CMD_DR --> CONFIG

    GW --> SESS
    GW --> PROTO
    GW --> AGENT
    GW --> ROUTER
    GW --> MANAGER

    AGENT --> TOOLS
    AGENT --> PROV_A
    AGENT --> PROV_O
    AGENT --> TYPES
    AGENT --> CONFIG

    ROUTER --> AGENT
    ROUTER --> CONFIG

    MANAGER --> TRANS
    MANAGER --> TERM
    MANAGER --> FEISHU

    TERM --> TRANS
    FEISHU --> TRANS

    PLUGIN --> TYPES
    PLUGIN --> TRANS

    style ENTRY fill:#e1f5fe
    style CONFIG fill:#fff3e0
    style AGENT fill:#e8f5e9
    style GW fill:#fce4ec
    style ROUTER fill:#f3e5f5
    style PLUGIN fill:#fff9c4
```

### 模块清单

| 章节 | 模块 | 关键文件 | 职责 |
| --- | --- | --- | --- |
| Ch.1 | 入口点 | `src/entry.ts` | 程序启动、CLI 解析、全局错误处理 |
| Ch.2 | CLI 框架 | `src/cli/program.ts`, `src/cli/register.ts` | Commander.js 命令注册、参数处理、上下文传递 |
| Ch.3 | 配置系统 | `src/config/schema.ts`, `src/config/loader.ts` | Zod 验证、YAML 加载、默认配置生成、密钥解析 |
| Ch.4 | 网关服务器 | `src/gateway/server.ts`, `src/gateway/session.ts` | WebSocket 通信、HTTP 健康检查、会话管理、认证 |
| Ch.5 | Agent 运行时 | `src/agent/runtime.ts`, `src/agent/tools.ts`, `src/agent/providers/` | Agent Loop、LLM 调用、工具执行、多 Provider 支持 |
| Ch.6 | 通道抽象 | `src/channels/transport.ts`, `src/channels/terminal.ts` | Channel 基类、EventEmitter 事件模型、终端交互 |
| Ch.7 | 消息路由 | `src/routing/router.ts` | 分层路由匹配（精确 → 通配符 → 报错） |
| Ch.8 | 飞书集成 | `src/channels/feishu.ts` | 飞书机器人消息收发 |
| Ch.9 | 插件系统 | `src/plugins/registry.ts` | 插件生命周期管理、工具/通道注册、IoC 容器 |

---

## 所有 CLI 命令

通过 `src/cli/register.ts` 注册的完整命令列表：

| 命令 | 选项 | 说明 |
| --- | --- | --- |
| `myclaw agent` | `-m, --model <model>` 覆盖模型<br/>`-p, --provider <id>` 指定 Provider | 启动交互式终端聊天会话，直接与 Agent 对话 |
| `myclaw gateway` | `--port <port>` 指定端口<br/>`--host <host>` 指定主机 | 启动 WebSocket 网关服务器，支持多通道接入 |
| `myclaw onboard` | 无 | 引导式初始化配置向导，创建 `~/.myclaw/myclaw.yaml` |
| `myclaw doctor` | 无 | 诊断检查：Node.js 版本、配置文件、API Key、通道状态 |
| `myclaw message send` | 消息内容参数 | 从命令行发送单条消息（非交互模式），适合脚本集成 |

---

## 详细运行指南

下面是从零开始运行 MyClaw 的完整步骤，包含你在终端中实际会看到的输出。

### 第一步：安装依赖

```bash
npm install
```

期望输出：

```
added 127 packages, and audited 128 packages in 8s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

安装的核心依赖包及其用途：

| 包名 | 用途 |
| --- | --- |
| `commander` | CLI 框架，解析命令和参数 |
| `zod` | 运行时类型验证，用于配置 Schema |
| `js-yaml` | YAML 文件解析 |
| `ws` | WebSocket 服务器实现 |
| `chalk` | 终端彩色输出 |
| `@anthropic-ai/sdk` | Anthropic Claude API 客户端 |
| `openai` | OpenAI API 客户端（也用于 OpenRouter） |
| `tsx` | TypeScript 直接执行，无需编译 |

### 第二步：设置 API Key

MyClaw 支持三种 LLM Provider，你至少需要配置一个：

**方式一：Anthropic Claude（推荐）**

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx"
```

**方式二：OpenAI**

```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
```

**方式三：OpenRouter（默认配置，支持免费模型）**

```bash
export OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
```

> **提示**：OpenRouter 是一个 LLM 聚合平台，它提供统一的 API 来访问多种模型，包括一些免费模型（如 `stepfun/step-3.5-flash:free`）。MyClaw 的默认配置使用 OpenRouter，对于学习和测试来说非常方便。

你可以将 API Key 写入 shell 配置文件以持久化：

```bash
# 写入 ~/.zshrc 或 ~/.bashrc
echo 'export OPENROUTER_API_KEY="sk-or-v1-your-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### 第三步：运行 onboard 初始化配置

```bash
npx tsx src/entry.ts onboard
```

期望输出和交互过程：

```
🦀 Welcome to MyClaw Setup!

Let's configure your personal AI assistant.

LLM Provider (anthropic/openai) [anthropic]: ↵
✓ Found OPENROUTER_API_KEY in environment
Model [stepfun/step-3.5-flash:free]: ↵
Gateway port [18789]: ↵
Bot name [MyClaw]: ↵

Enable Feishu channel? (y/N): N

✓ Configuration saved to /Users/you/.myclaw/myclaw.yaml

Next steps:
  myclaw agent    - Start chatting
  myclaw gateway  - Start the gateway server
  myclaw doctor   - Run diagnostics
```

执行完成后，`~/.myclaw/myclaw.yaml` 文件内容类似：

```yaml
gateway:
  host: "127.0.0.1"
  port: 18789

providers:
  - id: default
    type: openrouter
    apiKeyEnv: OPENROUTER_API_KEY
    model: "stepfun/step-3.5-flash:free"
    maxTokens: 4096
    temperature: 0.7

defaultProvider: default

channels:
  - id: terminal
    type: terminal
    enabled: true
    greeting: "Hello! I'm MyClaw, your AI assistant. Type /help for commands."

routing:
  - channel: "*"
    agent: default

plugins: []

agent:
  name: MyClaw
  maxHistoryMessages: 50
  toolApproval: true
```

### 第四步：启动交互式聊天（myclaw agent）

```bash
npx tsx src/entry.ts agent
```

以下是一个完整的示例聊天会话，展示了普通对话和工具调用两种场景：

```
MyClaw: Hello! I'm MyClaw, your AI assistant. Type /help for commands.

You: 你好，你是谁？

MyClaw: 你好！我是 MyClaw，你的个人 AI 助手。我可以帮你完成各种任务，
比如读写文件、执行命令、搜索代码等。有什么可以帮你的吗？

You: 帮我查看当前目录下有哪些文件

  [tool] ls({})
  [tool] → d  docs/
  d  src/
  f  package.json  (1.2K)
  f  tsconfig.json  (0.3K)
  f  README.md  (2.1K)

MyClaw: 当前目录下有以下文件和文件夹：

📁 目录：
  - docs/
  - src/

📄 文件：
  - package.json (1.2K)
  - tsconfig.json (0.3K)
  - README.md (2.1K)

需要我查看某个文件的内容吗？

You: 读一下 package.json 的 name 和 version

  [tool] read({"file_path":"package.json","limit":5})
  [tool] →      1	{
       2	  "name": "myclaw",
       3	  "version": "1.0.0",
       4	  "type": "module",
       5	  "description": "Build your own OpenClaw - a teaching project"

MyClaw: 项目信息如下：
  - name: myclaw
  - version: 1.0.0

You: /help

Available commands:
  /help    - Show this help
  /clear   - Clear conversation history
  /history - Show conversation history
  /status  - Show status
  /quit    - Exit

You: /status

  Channel: terminal (terminal)
  Session: terminal:terminal
  History: 6 messages

You: /quit
```

使用命令行选项覆盖默认配置：

```bash
# 使用特定模型
npx tsx src/entry.ts agent --model claude-haiku-4

# 使用特定 Provider
npx tsx src/entry.ts agent --provider openai

# 同时指定 Provider 和模型
npx tsx src/entry.ts agent --provider anthropic --model claude-sonnet-4-6
```

### 第五步：启动网关服务器（myclaw gateway）

```bash
npx tsx src/entry.ts gateway
```

期望输出：

```
🦀 MyClaw Gateway
   WebSocket: ws://127.0.0.1:18789
   Health:    http://127.0.0.1:18789/health
   Auth:      disabled
   Channels:  1 active
   Provider:  default
```

使用自定义端口和主机：

```bash
npx tsx src/entry.ts gateway --port 9000 --host 0.0.0.0
```

输出：

```
🦀 MyClaw Gateway
   WebSocket: ws://0.0.0.0:9000
   Health:    http://0.0.0.0:9000/health
   Auth:      disabled
   Channels:  1 active
   Provider:  default
```

验证健康检查端点：

```bash
curl http://127.0.0.1:18789/health
```

返回：

```json
{"status":"ok","uptime":5432}
```

### 第六步：通过 WebSocket 测试（wscat）

在另一个终端窗口中，使用 `wscat` 工具连接到网关：

```bash
# 安装 wscat（如果尚未安装）
npm install -g wscat

# 连接到 MyClaw 网关
wscat -c ws://127.0.0.1:18789
```

连接成功后，你可以进行以下完整测试：

**测试 1：Ping/Pong 心跳**

```
> {"type":"ping"}
< {"type":"pong"}
```

**测试 2：查看系统状态**

```
> {"type":"status"}
< {"type":"status.response","channels":[{"id":"terminal","type":"terminal","enabled":true}],"sessions":0,"uptime":12345}
```

**测试 3：发送聊天消息**

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"你好，你是谁？"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"你好！我是 MyClaw，你的个人 AI 助手。有什么可以帮你的吗？","done":true}
```

**测试 4：多轮对话（同一 sessionId 保持上下文）**

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"我上一句话说了什么？"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"你上一句话说的是「你好，你是谁？」","done":true}
```

**测试 5：发送未知消息类型（测试错误处理）**

```
> {"type":"unknown_type"}
< {"type":"error","code":"UNKNOWN_TYPE","message":"Unknown message type: unknown_type"}
```

**测试 6：发送非法 JSON（测试解析错误）**

```
> this is not json
< {"type":"error","code":"PARSE_ERROR","message":"Invalid JSON"}
```

**如果配置了认证 Token**，需要先发送 auth 消息：

```
> {"type":"auth","token":"your-secret-token"}
< {"type":"auth.result","success":true}

> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"你好"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"你好！","done":true}
```

未认证时发送消息会被拒绝：

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"你好"}
< {"type":"error","code":"UNAUTHORIZED","message":"Authenticate first"}
```

### 第七步：飞书集成测试

如果你在 onboard 步骤中启用了飞书通道，或者手动在配置文件中添加了飞书配置：

```yaml
channels:
  - id: terminal
    type: terminal
    enabled: true
    greeting: "Hello! I'm MyClaw, your AI assistant."
  - id: feishu
    type: feishu
    enabled: true
    appIdEnv: FEISHU_APP_ID
    appSecretEnv: FEISHU_APP_SECRET
```

设置飞书环境变量后启动网关：

```bash
export FEISHU_APP_ID="cli_xxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxx"
npx tsx src/entry.ts gateway
```

输出中会显示飞书通道已激活：

```
🦀 MyClaw Gateway
   WebSocket: ws://127.0.0.1:18789
   Health:    http://127.0.0.1:18789/health
   Auth:      disabled
   Channels:  2 active
   Provider:  default
```

此时，你的飞书机器人就可以接收消息并通过 MyClaw Agent 进行回复了。

### 第八步：运行诊断检查（myclaw doctor）

```bash
npx tsx src/entry.ts doctor
```

所有检查通过时的输出：

```
🩺 MyClaw Doctor

  ✓ Node.js 22.5.0
  ✓ State dir: /Users/you/.myclaw
  ✓ Config: /Users/you/.myclaw/myclaw.yaml
  ✓ Provider 'default': openrouter/stepfun/step-3.5-flash:free
  ✓ Channel 'terminal': terminal

  All checks passed! ✓
```

部分检查失败时的输出：

```
🩺 MyClaw Doctor

  ✓ Node.js 22.5.0
  ✓ State dir: /Users/you/.myclaw
  ✓ Config: /Users/you/.myclaw/myclaw.yaml
  ✗ Provider 'default': No API key found
    Set OPENROUTER_API_KEY
  ✓ Channel 'terminal': terminal
  ✗ Channel 'feishu': No App ID
    Run 'myclaw onboard' to create it

  Some checks failed. See above for details.
```

`doctor` 命令检查的内容包括：

| 检查项 | 说明 |
| --- | --- |
| Node.js 版本 | 必须 >= 20 |
| State 目录 | `~/.myclaw/` 是否存在 |
| 配置文件 | `~/.myclaw/myclaw.yaml` 是否存在 |
| Provider API Key | 每个 Provider 的 API Key 是否可用 |
| Channel 凭证 | 飞书等外部通道的凭证是否完整 |

---

## 启动序列

当你运行 `myclaw gateway` 时，系统内部到底发生了什么？下面的 Mermaid 流程图详细展示了启动过程：

```mermaid
flowchart TD
    START(["npx tsx src/entry.ts gateway"]) --> ENTRY["entry.ts: main()"]
    ENTRY --> BUILD["buildProgram()<br/>创建 Commander 实例"]
    BUILD --> REGISTER["registerAllCommands(program)<br/>注册所有 CLI 命令"]
    REGISTER --> PARSE["program.parseAsync(process.argv)<br/>解析命令行参数"]
    PARSE --> GATEWAY_CMD["gateway 命令被匹配"]
    GATEWAY_CMD --> CONTEXT["getContext(cmd)<br/>加载 ~/.myclaw/myclaw.yaml"]
    CONTEXT --> VALIDATE["Zod Schema 验证配置<br/>OpenClawConfigSchema.parse()"]

    VALIDATE --> |验证失败| ERROR["抛出 ZodError<br/>打印验证错误信息"]
    VALIDATE --> |验证通过| START_GW["startGatewayServer(opts)"]

    START_GW --> INIT_SESS["创建 SessionManager<br/>maxHistoryMessages: 50"]
    START_GW --> INIT_AGENT["createAgentRuntime(config)<br/>初始化 Agent"]
    START_GW --> INIT_ROUTER["createRouter(config, agent)<br/>构建路由表"]

    INIT_AGENT --> LOAD_TOOLS["加载内置工具<br/>read, write, edit, exec, grep, find, ls"]
    INIT_AGENT --> LOAD_PROVIDERS["创建 LLM Provider 实例<br/>Anthropic / OpenAI / OpenRouter"]
    LOAD_PROVIDERS --> CHECK_KEY{"API Key 存在？"}
    CHECK_KEY --> |否| SKIP["跳过该 Provider<br/>打印警告"]
    CHECK_KEY --> |是| CREATE_PROV["创建 Provider 实例"]

    INIT_ROUTER --> BUILD_RULES["解析路由规则"]

    START_GW --> HTTP["创建 HTTP Server<br/>注册 /health 端点"]
    HTTP --> WSS["创建 WebSocket Server<br/>挂载到 HTTP Server"]
    WSS --> HANDLERS["注册事件处理<br/>connection / message / close / error"]

    START_GW --> CHANNELS["createChannelManager(config)<br/>启动所有已启用的通道"]
    CHANNELS --> CH_TERM["启动 Terminal Channel"]
    CHANNELS --> CH_FEISHU["启动 Feishu Channel<br/>(如果配置了)"]

    HANDLERS --> LISTEN["httpServer.listen(port, host)"]
    LISTEN --> BANNER["打印 MyClaw Gateway 横幅<br/>显示 WebSocket/Health/Auth/Channels 信息"]
    BANNER --> READY(["等待客户端连接..."])

    style START fill:#e1f5fe
    style READY fill:#e8f5e9
    style ERROR fill:#ffcdd2
```

这个启动序列体现了一个重要原则：**先验证，后初始化，最后启动服务**。如果配置有误，系统会在启动早期就报错退出，而不是在运行时才崩溃。

---

## 扩展方向

MyClaw 的架构天然支持扩展。以下是一些具体的扩展方向和实现思路：

### 1. 添加新的通道

参照 `Channel` 抽象基类的模式，你只需实现三个方法：

```typescript
// 以 Discord 为例
import { Channel } from "../channels/transport.js";
import { Client, GatewayIntentBits } from "discord.js";

class DiscordChannel extends Channel {
  readonly id = "discord";
  readonly type = "discord";
  connected = false;

  private client: Client;

  constructor(private token: string) {
    super();
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
  }

  async start(): Promise<void> {
    this.client.on("messageCreate", (msg) => {
      if (msg.author.bot) return;
      this.emit("message", {
        channelId: this.id,
        sessionId: msg.channelId,
        senderId: msg.author.id,
        text: msg.content,
        timestamp: Date.now(),
      });
    });
    await this.client.login(this.token);
    this.connected = true;
  }

  async stop(): Promise<void> {
    this.client.destroy();
    this.connected = false;
  }

  async send(message: OutgoingMessage): Promise<void> {
    const channel = await this.client.channels.fetch(message.sessionId);
    if (channel?.isTextBased()) {
      await (channel as any).send(message.text);
    }
  }
}
```

可以添加的通道：Discord、Slack、微信（wechaty）、WhatsApp、Web UI 等。

### 2. 添加新的工具

通过插件系统注册新工具：

```typescript
// 一个实际的天气查询工具
const weatherPlugin: Plugin = {
  id: "weather",
  name: "Weather",
  version: "1.0.0",
  async onLoad(ctx) {
    ctx.registerTool({
      name: "get_weather",
      description: "查询指定城市的天气",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
        },
        required: ["city"],
      },
      execute: async (args) => {
        const resp = await fetch(
          `https://wttr.in/${encodeURIComponent(args.city as string)}?format=j1`
        );
        const data = await resp.json();
        return JSON.stringify(data.current_condition[0]);
      },
    });
  },
};
```

### 3. 持久化对话历史

当前对话历史存储在内存中。可以扩展 SessionManager 使用 SQLite：

```typescript
import Database from "better-sqlite3";

class PersistentSessionManager extends SessionManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    super(50);
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp INTEGER
      )
    `);
  }

  addMessage(sessionId: string, role: string, content: string) {
    super.addMessage(sessionId, role, content);
    this.db.prepare(
      "INSERT INTO messages VALUES (?, ?, ?, ?)"
    ).run(sessionId, role, content, Date.now());
  }
}
```

### 4. 流式响应

改造 `provider.chat()` 方法返回 AsyncIterable，让用户实时看到生成过程：

```typescript
async function* chatStream(request: ChatRequest): AsyncIterable<string> {
  const stream = await anthropic.messages.stream({ ... });
  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      yield event.delta.text;
    }
  }
}
```

### 5. 更多 LLM Provider

在 `agent/providers/` 目录下添加新文件即可。因为所有 Provider 都实现了统一的 `LLMProvider` 接口，新增 Provider 只需实现 `chat()` 方法：

- **Google Gemini**：使用 `@google/generative-ai` 包
- **本地模型**：通过 Ollama 的 OpenAI 兼容 API（设置 `baseUrl: "http://localhost:11434/v1"`）
- **Azure OpenAI**：使用 OpenAI 客户端 + 自定义 baseUrl

---

## MyClaw vs 完整版 OpenClaw 对比

| 特性 | MyClaw（教学版） | 完整版 OpenClaw |
| --- | --- | --- |
| **定位** | 教学项目，帮助理解架构 | 生产就绪的 AI Agent 平台 |
| **代码量** | ~3,000 行 TypeScript | 数万行 |
| **LLM Provider** | Anthropic + OpenAI + OpenRouter | 10+ 提供商，含本地模型 |
| **消息通道** | 终端 + 飞书 | 10+ 平台（Telegram/Discord/Slack...） |
| **内置工具** | 7 个（read/write/edit/exec/grep/find/ls） | 50+ 技能 |
| **扩展机制** | 简单插件框架 | 40+ 扩展，成熟的插件生态 |
| **对话存储** | 内存（重启丢失） | 多种持久化后端（SQLite/PostgreSQL/Redis） |
| **响应模式** | 非流式（等待完整生成） | 流式 + 非流式 |
| **部署方式** | `npx tsx` 本地运行 | Docker / K8s / 云原生部署 |
| **监控观测** | 基础日志 + chalk 输出 | Metrics、Tracing、告警系统 |
| **安全机制** | Token 认证 | RBAC、审计日志、端到端加密 |
| **错误处理** | 基础 try-catch | 重试策略、熔断器、降级方案 |
| **配置管理** | 单文件 YAML | 多环境配置、热更新、远程配置 |
| **测试覆盖** | 无 | 完整的单元/集成/E2E 测试 |

MyClaw 保留了 OpenClaw 的**核心架构骨架**，砍掉了生产环境所需的各种边缘情况处理，让你能专注于理解设计模式本身。

---

## 设计模式总结

通过这 10 个章节，我们一共学习了 8 个核心设计模式。这些模式不仅适用于 AI Agent 系统，也是构建任何可扩展软件的通用架构实践：

| # | 设计模式 | 来源章节 | 核心思想 | 在 MyClaw 中的体现 |
| --- | --- | --- | --- | --- |
| 1 | **CLI 架构** | Ch.1-2 | 用 Commander.js 构建可扩展的命令行界面，通过子命令模式组织功能 | `entry.ts` → `program.ts` → `register.ts` → 各命令文件 |
| 2 | **配置驱动** | Ch.3 | 用 Schema 定义配置结构，运行时验证，让系统行为完全由配置控制 | Zod Schema 定义 + YAML 文件 + `resolveSecret()` 密钥解析 |
| 3 | **网关模式** | Ch.4 | WebSocket 服务器作为中心化通信枢纽，协调所有子系统 | `gateway/server.ts` 同时管理 HTTP + WebSocket + 通道 |
| 4 | **Provider 抽象** | Ch.5 | 统一不同 LLM API 的调用接口，通过工厂函数创建具体实现 | `LLMProvider` 接口 + `createAnthropicProvider` / `createOpenAIProvider` |
| 5 | **通道抽象** | Ch.6 | 用抽象基类 + EventEmitter 让任何消息平台可以即插即用 | `Channel` 抽象基类 → `TerminalChannel` / `FeishuChannel` |
| 6 | **分层路由** | Ch.7 | 精确匹配 → 通配符匹配的分层路由策略，灵活的消息分发 | `Router.route()` 先找精确匹配，再找 `*` 通配符 |
| 7 | **外部集成** | Ch.8 | 与真实第三方服务对接的标准模式：凭证管理、事件驱动、错误处理 | 飞书通道集成，凭证通过 env var 或配置文件传入 |
| 8 | **插件化架构 (IoC)** | Ch.9 | 控制反转 + 依赖注入，通过 PluginContext 暴露注册接口 | `PluginRegistry` + `PluginContext { registerTool, registerChannel }` |

---

## 下一步：可以构建什么？

掌握了 MyClaw 的架构后，你可以尝试构建以下项目来进一步巩固和扩展所学知识：

### 项目 1：个人知识库助手

在 MyClaw 的基础上，添加向量数据库（如 ChromaDB）支持。用户可以上传文档，Agent 通过 RAG（Retrieval-Augmented Generation）模式从知识库中检索相关信息来回答问题。

**需要扩展的模块**：新增 `embed` 工具和 `search_knowledge` 工具，修改 system prompt 加入检索指导。

### 项目 2：团队 AI 助手

基于 MyClaw 的多通道架构，构建一个团队共享的 AI 助手。添加用户身份系统、权限控制，支持多个团队成员通过不同通道（飞书群、Web 界面）同时使用。

**需要扩展的模块**：增强 SessionManager 支持用户身份、添加 RBAC 中间件、持久化对话历史。

### 项目 3：自动化运维机器人

利用 MyClaw 的工具系统，构建一个运维机器人。它可以执行服务器健康检查、查看日志、重启服务，并通过飞书通道通知团队。

**需要扩展的模块**：新增运维工具（`check_service`、`tail_log`、`restart_service`），配置定时任务触发。

### 项目 4：代码审查助手

集成 Git 操作工具，让 Agent 可以读取 PR diff、分析代码变更、生成审查评论，并通过 webhook 与 GitHub/GitLab 集成。

**需要扩展的模块**：新增 Git 工具、添加 Webhook Channel、实现代码分析 prompt。

---

## 结语

MyClaw 是一个**教学项目**。它的目的不是成为一个生产级的 AI Agent 平台，而是帮助你理解这类系统的内部架构和设计理念。

通过这 10 个章节的学习，你已经亲手构建了：

- 一个完整的 CLI 框架，支持多命令、参数解析、上下文传递
- 一个基于 Zod 的配置系统，支持 YAML 加载、运行时验证、密钥管理
- 一个 WebSocket 网关，支持认证、会话管理、健康检查
- 一个 Agent 运行时，实现了完整的 Agent Loop（LLM 调用 → 工具执行 → 循环）
- 一套通道抽象，让任何消息平台都能即插即用
- 一个分层路由系统，灵活匹配消息到不同的 Provider
- 一个飞书集成，演示了与真实外部服务的对接
- 一个插件系统，通过控制反转实现了可扩展性

这些组件加在一起，构成了一个大约 3,000 行代码的完整系统。虽然它比完整版 OpenClaw 简单得多，但**核心架构是一致的**。理解了 MyClaw，你就理解了 OpenClaw 的设计哲学。

希望这个教程能够激发你构建自己的 AI Agent 系统的灵感。架构的精髓不在于代码量的多少，而在于抽象的合理性和模块之间的协作方式。现在，去构建属于你自己的系统吧！
