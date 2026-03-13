# Chapter 10: Integration and Running

Congratulations on making it to the final chapter! Over the previous 9 chapters, we built a complete AI Agent system from scratch -- **MyClaw**. This is a teaching project designed to help you understand the internal architecture and design philosophy of OpenClaw. Now let's bring all the components together, review how the system works end-to-end, and walk through how to run it in detail.

---

## Complete Data Flow

When a user sends a message, what journey does the data take through the MyClaw system? The following Mermaid sequence diagram shows the complete end-to-end flow:

```mermaid
sequenceDiagram
    participant U as User
    participant CH as Channel<br/>(Terminal/Feishu/WebSocket)
    participant GW as Gateway<br/>(WebSocket Gateway)
    participant SM as SessionManager<br/>(Session Management)
    participant RT as Router<br/>(Message Routing)
    participant AG as AgentRuntime<br/>(Agent Runtime)
    participant LLM as LLM Provider<br/>(Anthropic/OpenAI/OpenRouter)
    participant TL as Tools<br/>(read/write/exec/grep...)

    U->>CH: Send message "Read package.json for me"
    CH->>GW: IncomingMessage { channelId, sessionId, text }
    GW->>SM: getOrCreate(channelId, sessionId)
    SM-->>GW: Session { id, history }
    GW->>SM: addMessage(sessionId, "user", text)
    GW->>RT: route({ channelId, sessionId, text, history })
    RT->>RT: Match routing rules (exact match → wildcard → error)
    RT->>AG: chat({ providerId, messages })
    AG->>AG: buildSystemPrompt(config)
    AG->>LLM: Send messages + tools definitions
    LLM-->>AG: Return tool_calls: [read({file_path: "package.json"})]

    Note over AG,TL: Agent Loop: Tool invocation loop

    AG->>TL: execute read({ file_path: "package.json" })
    TL-->>AG: File contents (JSON)
    AG->>LLM: Send tool_result + continue conversation
    LLM-->>AG: Return text: "Here are the contents of package.json..."

    Note over AG,LLM: finishReason != tool_calls → Loop ends

    AG-->>RT: "Here are the contents of package.json..."
    RT-->>GW: response text
    GW->>SM: addMessage(sessionId, "assistant", response)
    GW-->>CH: GatewayResponse { type: "chat.response", text, done: true }
    CH-->>U: Display reply
```

This flow embodies MyClaw's core design philosophy: **each component has a clear responsibility and collaborates through well-defined interfaces**. The Channel handles sending and receiving messages, the Router handles routing decisions, the AgentRuntime handles LLM interactions and tool execution, and the SessionManager maintains conversation history.

### Agent Loop in Detail

The most critical part of AgentRuntime is the **Agent Loop**, which works as follows:

```mermaid
flowchart TD
    A[Receive user message] --> B[Build system prompt + assemble conversation history]
    B --> C[Call LLM API]
    C --> D{What did the LLM return?}
    D -->|text| E[Return text to user]
    D -->|tool_calls| F[Execute each tool]
    F --> G[Add tool results to message history]
    G --> H{Already completed 10 rounds?}
    H -->|No| C
    H -->|Yes| I[Force stop, return collected text]
    E --> J[Done]
    I --> J
```

With the `MAX_TOOL_ROUNDS = 10` limit, the system prevents infinite tool-calling loops by the LLM. This is a simple but important safety measure.

---

## System Architecture Review

### Module Dependency Graph

The following Mermaid diagram shows the dependency relationships between MyClaw's modules, helping you build an intuitive understanding of the overall architecture:

```mermaid
graph TD
    ENTRY["entry.ts<br/>Program Entry"]
    CLI["cli/program.ts<br/>CLI Framework"]
    REG["cli/register.ts<br/>Command Registration"]

    CMD_AGENT["commands/agent.ts<br/>Interactive Chat"]
    CMD_GW["commands/gateway.ts<br/>Gateway Service"]
    CMD_OB["commands/onboard.ts<br/>Setup Wizard"]
    CMD_DR["commands/doctor.ts<br/>Diagnostic Check"]
    CMD_MSG["commands/message.ts<br/>Single Message"]

    CONFIG["config/schema.ts<br/>Zod Schema"]
    LOADER["config/loader.ts<br/>YAML Loader"]

    GW["gateway/server.ts<br/>WebSocket Gateway"]
    SESS["gateway/session.ts<br/>Session Management"]
    PROTO["gateway/protocol.ts<br/>Message Protocol"]

    AGENT["agent/runtime.ts<br/>Agent Runtime"]
    MODEL["agent/model.ts<br/>Model Resolution"]
    CMD_AGENT_FILE["cli/commands/agent.ts<br/>Agent Command (InteractiveMode)"]

    TRANS["channels/transport.ts<br/>Channel Abstract Base"]
    TERM["channels/terminal.ts<br/>Terminal Channel"]
    FEISHU["channels/feishu.ts<br/>Feishu Channel"]
    MANAGER["channels/manager.ts<br/>Channel Manager"]

    ROUTER["routing/router.ts<br/>Message Router"]

    PLUGIN["plugins/registry.ts<br/>Plugin Registry"]

    ENTRY --> CLI
    ENTRY --> REG
    REG --> CMD_AGENT
    REG --> CMD_GW
    REG --> CMD_OB
    REG --> CMD_DR
    REG --> CMD_MSG

    CMD_AGENT --> CMD_AGENT_FILE
    CMD_AGENT_FILE --> AGENT
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

    AGENT --> MODEL
    AGENT --> CONFIG

    MODEL --> CONFIG

    ROUTER --> AGENT
    ROUTER --> CONFIG

    MANAGER --> TRANS
    MANAGER --> TERM
    MANAGER --> FEISHU

    TERM --> TRANS
    FEISHU --> TRANS

    PLUGIN --> TRANS

    style ENTRY fill:#e1f5fe
    style CONFIG fill:#fff3e0
    style AGENT fill:#e8f5e9
    style GW fill:#fce4ec
    style ROUTER fill:#f3e5f5
    style PLUGIN fill:#fff9c4
```

### Module Inventory

| Chapter | Module | Key Files | Responsibility |
| --- | --- | --- | --- |
| Ch.1 | Entry Point | `src/entry.ts` | Program startup, CLI parsing, global error handling |
| Ch.2 | CLI Framework | `src/cli/program.ts`, `src/cli/register.ts` | Commander.js command registration, argument handling, context passing |
| Ch.3 | Configuration System | `src/config/schema.ts`, `src/config/loader.ts` | Zod validation, YAML loading, default config generation, secret resolution |
| Ch.4 | Gateway Server | `src/gateway/server.ts`, `src/gateway/session.ts` | WebSocket communication, HTTP health check, session management, authentication |
| Ch.5 | Agent Runtime | `src/agent/runtime.ts`, `src/agent/model.ts`, `src/cli/commands/agent.ts` | Model resolution, pi-mono integration, InteractiveMode TUI, gateway path |
| Ch.6 | Channel Abstraction | `src/channels/transport.ts`, `src/channels/terminal.ts` | Channel base class, EventEmitter event model, terminal interaction |
| Ch.7 | Message Routing | `src/routing/router.ts` | Layered route matching (exact → wildcard → error) |
| Ch.8 | Feishu Integration | `src/channels/feishu.ts` | Feishu bot message sending and receiving |
| Ch.9 | Plugin System | `src/plugins/registry.ts` | Plugin lifecycle management, tool/channel registration, IoC container |

---

## All CLI Commands

The complete list of commands registered via `src/cli/register.ts`:

| Command | Options | Description |
| --- | --- | --- |
| `myclaw agent` | `-m, --model <model>` override model<br/>`-p, --provider <id>` specify Provider | Start an interactive terminal chat session, talk directly with the Agent |
| `myclaw gateway` | `--port <port>` specify port<br/>`--host <host>` specify host | Start the WebSocket gateway server, supporting multi-channel access |
| `myclaw onboard` | None | Guided initialization setup wizard, creates `~/.myclaw/myclaw.yaml` |
| `myclaw doctor` | None | Diagnostic check: Node.js version, config file, API Key, channel status |
| `myclaw message send` | Message content argument | Send a single message from the command line (non-interactive mode), suitable for script integration |

---

## Detailed Running Guide

Below are the complete steps to run MyClaw from scratch, including the actual output you'll see in your terminal.

### Step 1: Install Dependencies

```bash
npm install
```

Expected output:

```
added 127 packages, and audited 128 packages in 8s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

Core dependency packages and their purposes:

| Package | Purpose |
| --- | --- |
| `commander` | CLI framework for parsing commands and arguments |
| `zod` | Runtime type validation for configuration Schema |
| `js-yaml` | YAML file parsing |
| `ws` | WebSocket server implementation |
| `chalk` | Colored terminal output |
| `@anthropic-ai/sdk` | Anthropic Claude API client |
| `openai` | OpenAI API client (also used for OpenRouter) |
| `tsx` | Direct TypeScript execution without compilation |

### Step 2: Set Up API Key

MyClaw supports three LLM Providers. You need to configure at least one:

**Option 1: Anthropic Claude (recommended)**

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx"
```

**Option 2: OpenAI**

```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
```

**Option 3: OpenRouter (default configuration, supports free models)**

```bash
export OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Tip**: OpenRouter is an LLM aggregation platform that provides a unified API to access multiple models, including some free models (such as `stepfun/step-3.5-flash:free`). MyClaw's default configuration uses OpenRouter, which is very convenient for learning and testing.

You can persist the API Key by writing it to your shell configuration file:

```bash
# Write to ~/.zshrc or ~/.bashrc
echo 'export OPENROUTER_API_KEY="sk-or-v1-your-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### Step 3: Run Onboard to Initialize Configuration

```bash
npx tsx src/entry.ts onboard
```

Expected output and interaction process:

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

After completion, the `~/.myclaw/myclaw.yaml` file will look something like this:

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

### Step 4: Start Interactive Chat (myclaw agent)

```bash
npx tsx src/entry.ts agent
```

Here is a complete example chat session demonstrating both regular conversation and tool invocation scenarios:

```
MyClaw: Hello! I'm MyClaw, your AI assistant. Type /help for commands.

You: Hi, who are you?

MyClaw: Hi! I'm MyClaw, your personal AI assistant. I can help you with
various tasks like reading and writing files, executing commands, searching
code, and more. What can I help you with?

You: Show me what files are in the current directory

  [tool] ls({})
  [tool] → d  docs/
  d  src/
  f  package.json  (1.2K)
  f  tsconfig.json  (0.3K)
  f  README.md  (2.1K)

MyClaw: Here are the files and folders in the current directory:

📁 Directories:
  - docs/
  - src/

📄 Files:
  - package.json (1.2K)
  - tsconfig.json (0.3K)
  - README.md (2.1K)

Would you like me to look at the contents of any file?

You: Read the name and version from package.json

  [tool] read({"file_path":"package.json","limit":5})
  [tool] →      1	{
       2	  "name": "myclaw",
       3	  "version": "1.0.0",
       4	  "type": "module",
       5	  "description": "Build your own OpenClaw - a teaching project"

MyClaw: Here's the project info:
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

Override default configuration with command-line options:

```bash
# Use a specific model
npx tsx src/entry.ts agent --model claude-haiku-4

# Use a specific Provider
npx tsx src/entry.ts agent --provider openai

# Specify both Provider and model
npx tsx src/entry.ts agent --provider anthropic --model claude-sonnet-4-6
```

### Step 5: Start the Gateway Server (myclaw gateway)

```bash
npx tsx src/entry.ts gateway
```

Expected output:

```
🦀 MyClaw Gateway
   WebSocket: ws://127.0.0.1:18789
   Health:    http://127.0.0.1:18789/health
   Auth:      disabled
   Channels:  1 active
   Provider:  default
```

Use a custom port and host:

```bash
npx tsx src/entry.ts gateway --port 9000 --host 0.0.0.0
```

Output:

```
🦀 MyClaw Gateway
   WebSocket: ws://0.0.0.0:9000
   Health:    http://0.0.0.0:9000/health
   Auth:      disabled
   Channels:  1 active
   Provider:  default
```

Verify the health check endpoint:

```bash
curl http://127.0.0.1:18789/health
```

Response:

```json
{"status":"ok","uptime":5432}
```

### Step 6: Test via WebSocket (wscat)

In another terminal window, use the `wscat` tool to connect to the gateway:

```bash
# Install wscat (if not already installed)
npm install -g wscat

# Connect to MyClaw gateway
wscat -c ws://127.0.0.1:18789
```

Once connected, you can perform the following tests:

**Test 1: Ping/Pong Heartbeat**

```
> {"type":"ping"}
< {"type":"pong"}
```

**Test 2: View System Status**

```
> {"type":"status"}
< {"type":"status.response","channels":[{"id":"terminal","type":"terminal","enabled":true}],"sessions":0,"uptime":12345}
```

**Test 3: Send a Chat Message**

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"Hello, who are you?"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"Hello! I'm MyClaw, your personal AI assistant. What can I help you with?","done":true}
```

**Test 4: Multi-turn Conversation (same sessionId maintains context)**

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"What did I say in my last message?"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"Your last message was 'Hello, who are you?'","done":true}
```

**Test 5: Send Unknown Message Type (test error handling)**

```
> {"type":"unknown_type"}
< {"type":"error","code":"UNKNOWN_TYPE","message":"Unknown message type: unknown_type"}
```

**Test 6: Send Invalid JSON (test parsing errors)**

```
> this is not json
< {"type":"error","code":"PARSE_ERROR","message":"Invalid JSON"}
```

**If authentication Token is configured**, you need to send an auth message first:

```
> {"type":"auth","token":"your-secret-token"}
< {"type":"auth.result","success":true}

> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"Hello"}
< {"type":"chat.response","channelId":"terminal","sessionId":"test-001","text":"Hello!","done":true}
```

Sending messages without authentication will be rejected:

```
> {"type":"chat","channelId":"terminal","sessionId":"test-001","text":"Hello"}
< {"type":"error","code":"UNAUTHORIZED","message":"Authenticate first"}
```

### Step 7: Feishu Integration Test

If you enabled the Feishu channel during the onboard step, or manually added Feishu configuration to the config file:

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

Set the Feishu environment variables and start the gateway:

```bash
export FEISHU_APP_ID="cli_xxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxx"
npx tsx src/entry.ts gateway
```

The output will show that the Feishu channel is active:

```
🦀 MyClaw Gateway
   WebSocket: ws://127.0.0.1:18789
   Health:    http://127.0.0.1:18789/health
   Auth:      disabled
   Channels:  2 active
   Provider:  default
```

At this point, your Feishu bot can receive messages and respond through the MyClaw Agent.

### Step 8: Run Diagnostic Check (myclaw doctor)

```bash
npx tsx src/entry.ts doctor
```

Output when all checks pass:

```
🩺 MyClaw Doctor

  ✓ Node.js 22.5.0
  ✓ State dir: /Users/you/.myclaw
  ✓ Config: /Users/you/.myclaw/myclaw.yaml
  ✓ Provider 'default': openrouter/stepfun/step-3.5-flash:free
  ✓ Channel 'terminal': terminal

  All checks passed! ✓
```

Output when some checks fail:

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

What the `doctor` command checks:

| Check Item | Description |
| --- | --- |
| Node.js version | Must be >= 20 |
| State directory | Whether `~/.myclaw/` exists |
| Configuration file | Whether `~/.myclaw/myclaw.yaml` exists |
| Provider API Key | Whether each Provider's API Key is available |
| Channel credentials | Whether credentials for external channels like Feishu are complete |

---

## Startup Sequence

What actually happens inside the system when you run `myclaw gateway`? The following Mermaid flowchart details the startup process:

```mermaid
flowchart TD
    START(["npx tsx src/entry.ts gateway"]) --> ENTRY["entry.ts: main()"]
    ENTRY --> BUILD["buildProgram()<br/>Create Commander instance"]
    BUILD --> REGISTER["registerAllCommands(program)<br/>Register all CLI commands"]
    REGISTER --> PARSE["program.parseAsync(process.argv)<br/>Parse command-line arguments"]
    PARSE --> GATEWAY_CMD["gateway command matched"]
    GATEWAY_CMD --> CONTEXT["getContext(cmd)<br/>Load ~/.myclaw/myclaw.yaml"]
    CONTEXT --> VALIDATE["Zod Schema validates config<br/>OpenClawConfigSchema.parse()"]

    VALIDATE --> |Validation failed| ERROR["Throw ZodError<br/>Print validation error info"]
    VALIDATE --> |Validation passed| START_GW["startGatewayServer(opts)"]

    START_GW --> INIT_SESS["Create SessionManager<br/>maxHistoryMessages: 50"]
    START_GW --> INIT_AGENT["createAgentRuntime(config)<br/>Initialize Agent"]
    START_GW --> INIT_ROUTER["createRouter(config, agent)<br/>Build routing table"]

    INIT_AGENT --> LOAD_PI["Load pi-coding-agent<br/>Built-in tools + Skills scan"]
    INIT_AGENT --> RESOLVE_MODEL["resolveModel(config)<br/>Map to pi-ai Model"]
    RESOLVE_MODEL --> CHECK_KEY{"API Key exists?"}
    CHECK_KEY --> |No| SKIP["Skip this model<br/>Print warning"]
    CHECK_KEY --> |Yes| CREATE_SESSION["createAgentSession()<br/>Create pi-coding-agent session"]

    INIT_ROUTER --> BUILD_RULES["Parse routing rules"]

    START_GW --> HTTP["Create HTTP Server<br/>Register /health endpoint"]
    HTTP --> WSS["Create WebSocket Server<br/>Mount on HTTP Server"]
    WSS --> HANDLERS["Register event handlers<br/>connection / message / close / error"]

    START_GW --> CHANNELS["createChannelManager(config)<br/>Start all enabled channels"]
    CHANNELS --> CH_TERM["Start Terminal Channel"]
    CHANNELS --> CH_FEISHU["Start Feishu Channel<br/>(if configured)"]

    HANDLERS --> LISTEN["httpServer.listen(port, host)"]
    LISTEN --> BANNER["Print MyClaw Gateway banner<br/>Show WebSocket/Health/Auth/Channels info"]
    BANNER --> READY(["Waiting for client connections..."])

    style START fill:#e1f5fe
    style READY fill:#e8f5e9
    style ERROR fill:#ffcdd2
```

This startup sequence reflects an important principle: **validate first, then initialize, and finally start the service**. If the configuration is incorrect, the system will error out early during startup rather than crashing at runtime.

---

## Extension Directions

MyClaw's architecture naturally supports extension. Here are some specific extension directions and implementation ideas:

### 1. Adding New Channels

Following the `Channel` abstract base class pattern, you only need to implement three methods:

```typescript
// Discord as an example
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

Channels you could add: Discord, Slack, WeChat (wechaty), WhatsApp, Web UI, and more.

### 2. Adding New Tools

Register new tools through the plugin system:

```typescript
// A practical weather query tool
const weatherPlugin: Plugin = {
  id: "weather",
  name: "Weather",
  version: "1.0.0",
  async onLoad(ctx) {
    ctx.registerTool({
      name: "get_weather",
      description: "Query weather for a specified city",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
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

### 3. Persisting Conversation History

Currently, conversation history is stored in memory. You can extend SessionManager to use SQLite:

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

### 4. Streaming Responses

Transform the `provider.chat()` method to return an AsyncIterable, allowing users to see the generation process in real time:

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

### 5. More LLM Providers

MyClaw supports multiple LLM providers through pi-ai's `ModelRegistry`. To add a new model:

1. **Add provider in config**: Edit `~/.myclaw/myclaw.yaml`
2. **Set API Key**: Via environment variable or config file's `apiKey` field
3. **Specify model name**: Use the provider's supported model ID

pi-ai's model registry has built-in parameters (context window, cost, etc.) for mainstream models. For custom models (like local Ollama):

```yaml
providers:
  - id: ollama
    type: openai
    model: llama2
    baseUrl: http://localhost:11434/v1
    apiKey: dummy  # Ollama doesn't need a real key
```

Supported provider types:
- **anthropic**: Anthropic Claude
- **openai**: OpenAI GPT
- **openrouter**: OpenRouter (free model aggregator)
- Any **OpenAI-compatible API** (via `type: openai` + custom `baseUrl`)

---

## MyClaw vs Full OpenClaw Comparison

| Feature | MyClaw (Teaching Version) | Full OpenClaw |
| --- | --- | --- |
| **Purpose** | Teaching project to help understand architecture | Production-ready AI Agent platform |
| **Code size** | ~2,600 lines of TypeScript | Tens of thousands of lines |
| **LLM Providers** | Anthropic + OpenAI + OpenRouter | 10+ providers, including local models |
| **Message Channels** | Terminal + Feishu | 10+ platforms (Telegram/Discord/Slack...) |
| **Built-in Tools** | pi-coding-agent tool set (read/write/edit/bash) | 50+ skills |
| **Extension Mechanism** | Simple plugin framework | 40+ extensions, mature plugin ecosystem |
| **Conversation Storage** | In-memory (lost on restart) | Multiple persistence backends (SQLite/PostgreSQL/Redis) |
| **Response Mode** | Non-streaming (waits for complete generation) | Streaming + non-streaming |
| **Deployment** | `npx tsx` local execution | Docker / K8s / cloud-native deployment |
| **Observability** | Basic logging + chalk output | Metrics, Tracing, alerting system |
| **Security** | Token authentication | RBAC, audit logs, end-to-end encryption |
| **Error Handling** | Basic try-catch | Retry strategies, circuit breakers, fallback plans |
| **Configuration** | Single YAML file | Multi-environment config, hot reload, remote config |
| **Test Coverage** | None | Complete unit/integration/E2E tests |

MyClaw preserves OpenClaw's **core architectural skeleton** while stripping away the various edge case handling needed for production environments, letting you focus on understanding the design patterns themselves.

---

## Design Pattern Summary

Through these 10 chapters, we learned a total of 8 core design patterns. These patterns are not only applicable to AI Agent systems but are also universal architectural practices for building any extensible software:

| # | Design Pattern | Source Chapter | Core Idea | Implementation in MyClaw |
| --- | --- | --- | --- | --- |
| 1 | **CLI Architecture** | Ch.1-2 | Build an extensible command-line interface with Commander.js, organizing functionality through subcommand patterns | `entry.ts` → `program.ts` → `register.ts` → individual command files |
| 2 | **Configuration-Driven** | Ch.3 | Define config structure with Schema, validate at runtime, let system behavior be fully controlled by configuration | Zod Schema definition + YAML file + `resolveSecret()` secret resolution |
| 3 | **Gateway Pattern** | Ch.4 | WebSocket server as a centralized communication hub, coordinating all subsystems | `gateway/server.ts` manages HTTP + WebSocket + channels simultaneously |
| 4 | **Provider Abstraction** | Ch.5 | Unify different LLM API calling interfaces, create concrete implementations through factory functions | `LLMProvider` interface + `createAnthropicProvider` / `createOpenAIProvider` |
| 5 | **Channel Abstraction** | Ch.6 | Use abstract base class + EventEmitter to make any messaging platform plug-and-play | `Channel` abstract base class → `TerminalChannel` / `FeishuChannel` |
| 6 | **Layered Routing** | Ch.7 | Exact match → wildcard match layered routing strategy for flexible message dispatch | `Router.route()` first looks for exact match, then `*` wildcard |
| 7 | **External Integration** | Ch.8 | Standard patterns for interfacing with real third-party services: credential management, event-driven, error handling | Feishu channel integration, credentials passed via env vars or config file |
| 8 | **Plugin Architecture (IoC)** | Ch.9 | Inversion of Control + Dependency Injection, exposing registration interfaces through PluginContext | `PluginRegistry` + `PluginContext { registerTool, registerChannel }` |

---

## What's Next: What Can You Build?

After mastering MyClaw's architecture, you can try building the following projects to further solidify and expand what you've learned:

### Project 1: Personal Knowledge Base Assistant

Build on top of MyClaw by adding vector database support (such as ChromaDB). Users can upload documents, and the Agent retrieves relevant information from the knowledge base using the RAG (Retrieval-Augmented Generation) pattern to answer questions.

**Modules to extend**: Add new `embed` and `search_knowledge` tools, modify the system prompt to include retrieval guidance.

### Project 2: Team AI Assistant

Leveraging MyClaw's multi-channel architecture, build a shared AI assistant for teams. Add a user identity system, access control, and support for multiple team members to use it simultaneously through different channels (Feishu groups, Web interface).

**Modules to extend**: Enhance SessionManager with user identity support, add RBAC middleware, persist conversation history.

### Project 3: Automated DevOps Bot

Using MyClaw's tool system, build a DevOps bot that can perform server health checks, view logs, restart services, and notify the team through the Feishu channel.

**Modules to extend**: Add DevOps tools (`check_service`, `tail_log`, `restart_service`), configure scheduled task triggers.

### Project 4: Code Review Assistant

Integrate Git operation tools so the Agent can read PR diffs, analyze code changes, generate review comments, and integrate with GitHub/GitLab through webhooks.

**Modules to extend**: Add Git tools, create a Webhook Channel, implement code analysis prompts.

---

## Conclusion

MyClaw is a **teaching project**. Its purpose is not to be a production-grade AI Agent platform, but to help you understand the internal architecture and design philosophy of such systems.

Through these 10 chapters of learning, you have built with your own hands:

- A complete CLI framework supporting multiple commands, argument parsing, and context passing
- A Zod-based configuration system supporting YAML loading, runtime validation, and secret management
- A WebSocket gateway supporting authentication, session management, and health checks
- An Agent runtime implementing a complete Agent Loop (LLM call → tool execution → loop)
- A set of channel abstractions that make any messaging platform plug-and-play
- A layered routing system that flexibly matches messages to different Providers
- A Feishu integration demonstrating interfacing with real external services
- A plugin system achieving extensibility through Inversion of Control

Together, these components form a complete system of approximately 2,600 lines of code. While it's much simpler than the full version of OpenClaw, **the core architecture is consistent**. Understanding MyClaw means understanding OpenClaw's design philosophy.

We hope this tutorial inspires you to build your own AI Agent systems. The essence of architecture lies not in the amount of code, but in the soundness of abstractions and the way modules collaborate. Now, go build your own system!
