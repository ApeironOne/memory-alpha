# Memory Alpha — OpenClaw Memory Plugin

**Universal memory system for OpenClaw with flexible deployment options.**

## Features

- **Dual storage:** SQLite (keyword search) + optional Qdrant (vector search)
- **Deployment-agnostic:** Works on any system (Synology, Linux, macOS, Windows)
- **Flexible modes:** SQLite-only, hybrid, or full vector search
- **Multi-gateway support:** Share memories across multiple OpenClaw instances
- **Auto-capture:** Automatically save important conversation moments
- **Smart recall:** Inject relevant memories into prompts

## Quick Start

### 1. Installation

```bash
npm install
npm run build
```

Then install to OpenClaw:

```bash
openclaw install /path/to/memory-alpha-plugin/implementation
```

### 2. Configuration

Memory Alpha requires configuration via environment variables. Choose a deployment mode:

#### SQLite-Only Mode (Simplest)

**Best for:** Single-user OR multi-user, local memory only, no AI infrastructure needed.

```bash
# Synology
export MEMORY_ALPHA_SQLITE_PATH=/volume1/openclaw/memory-alpha.db

# Linux
export MEMORY_ALPHA_SQLITE_PATH=/opt/openclaw/memory-alpha.db

# macOS
export MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db

# Windows (PowerShell)
$env:MEMORY_ALPHA_SQLITE_PATH="C:\openclaw\memory-alpha.db"
```

**Features enabled:** Keyword search (FTS5), metadata tracking  
**Features disabled:** Semantic vector search

#### Full Mode (Recommended)

**Best for:** Shared memory across multiple gateways, semantic search.

**Requirements:**
- Qdrant instance (vector database)
- Ollama instance (for embeddings)

```bash
# Storage
export MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db

# Qdrant (vector database)
export MEMORY_ALPHA_QDRANT_URL=http://192.168.0.126:6333
export MEMORY_ALPHA_QDRANT_COLLECTION=memory_alpha

# Ollama (embeddings)
export MEMORY_ALPHA_OLLAMA_URL=http://192.168.0.126:11434
export MEMORY_ALPHA_EMBED_MODEL=snowflake-arctic-embed2
export MEMORY_ALPHA_EMBED_DIMENSIONS=1024

# Multi-gateway mode
export MEMORY_ALPHA_SHARED_POOL=true
```

**Features enabled:** Keyword search, semantic vector search, multi-gateway sharing

#### Hybrid Mode

**Best for:** Local Ollama, remote Qdrant (or vice versa).

```bash
export MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db
export MEMORY_ALPHA_QDRANT_URL=http://192.168.0.126:6333  # Remote
export MEMORY_ALPHA_OLLAMA_URL=http://127.0.0.1:11434     # Local
export MEMORY_ALPHA_SHARED_POOL=true
```

### 3. Restart OpenClaw Gateway

```bash
openclaw gateway restart
```

Check logs for successful registration:

```
[info] memory-alpha: registering mode=full sqlitePath=/Users/.../memory-alpha.db qdrant=enabled ollama=enabled
[info] memory-alpha: SQLite initialized path=/Users/.../memory-alpha.db
[info] memory-alpha: tools registered (vector search enabled) mode=full tools=["memory_save","memory_search","memory_recall"]
[info] memory-alpha: registration complete mode=full
```

## Usage

### Tools Available

Once installed, three tools are available to the AI:

#### `memory_save`

Save important information to memory.

```typescript
memory_save({
  text: "Captain prefers minimal narration for routine tasks",
  tags: ["preference", "communication"],
  memory_type: "preference",
  agent_id: "kei",
  user_id: "captain",
  session_id: "agent:main:main"
})
```

#### `memory_search`

Search memories semantically (full mode) or by keyword (SQLite-only).

```typescript
memory_search({
  query: "communication preferences",
  limit: 5
})
```

#### `memory_recall`

Smart recall with usage tracking (full mode only).

```typescript
memory_recall({
  query: "how does Captain prefer status updates",
  limit: 10
})
```

## Configuration Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `MEMORY_ALPHA_SQLITE_PATH` | Path to SQLite database | `/volume1/openclaw/memory.db` |

### Optional (Vector Search)

| Variable | Description | Default |
|----------|-------------|---------|
| `MEMORY_ALPHA_QDRANT_URL` | Qdrant server URL | _(disabled)_ |
| `MEMORY_ALPHA_QDRANT_COLLECTION` | Qdrant collection name | `memory_alpha` |
| `MEMORY_ALPHA_OLLAMA_URL` | Ollama server URL | _(disabled)_ |
| `MEMORY_ALPHA_EMBED_MODEL` | Embedding model | `snowflake-arctic-embed2` |
| `MEMORY_ALPHA_EMBED_DIMENSIONS` | Embedding dimensions | `1024` |

### Optional (Behavior)

| Variable | Description | Default |
|----------|-------------|---------|
| `MEMORY_ALPHA_SHARED_POOL` | Multi-gateway mode | `false` |
| `MEMORY_ALPHA_AUTO_CAPTURE` | Auto-save important moments | `true` |
| `MEMORY_ALPHA_AUTO_RECALL` | Auto-inject memories into prompts | `true` |
| `MEMORY_ALPHA_RECALL_LIMIT` | Number of memories to recall | `10` |

## Deployment Modes

### SQLite-Only

**What it does:**
- Stores memories in local SQLite database
- Full-text keyword search via FTS5
- Metadata tracking (tags, timestamps, usage counts)

**What it doesn't do:**
- Semantic vector search
- Multi-gateway sharing (each gateway has isolated memory)

**Use when:**
- You don't have Qdrant/Ollama infrastructure
- Simple keyword search is enough
- Single-user, single-gateway setup

### Full Mode

**What it does:**
- Everything in SQLite-only mode, plus:
- Semantic vector search (understand meaning, not just keywords)
- Multi-gateway shared memory pool
- Cross-agent memory sharing

**Use when:**
- You have Qdrant + Ollama running
- Multiple gateways need to share memories
- You want AI-powered semantic search

### Multi-User Support

Memories are tagged with both `user_id` and `agent_id`, enabling per-user memory isolation in shared environments.

- **`user_id`** — identifies who the memory belongs to (optional, backward-compatible)
- **`agent_id`** — identifies which agent created the memory

When saving via the `memory_save` tool, pass `user_id` to associate the memory with a specific user:

```typescript
memory_save({
  text: "User prefers dark mode",
  user_id: "user-42",
  agent_id: "kei"
})
```

When memories are auto-captured via hooks, `user_id` is extracted automatically from the hook context (`hookCtx.user.id`, `hookCtx.author.id`, or `hookCtx.message.userId`).

If `user_id` is not provided, the memory is still saved — it simply won't be associated with a specific user.

## Infrastructure Setup

### Qdrant (Vector Database)

**Docker:**

```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v /path/to/qdrant-data:/qdrant/storage \
  qdrant/qdrant:latest
```

**Verify:**

```bash
curl http://localhost:6333/collections
```

### Ollama (Embeddings)

**macOS:**

```bash
brew install ollama
ollama serve
ollama pull snowflake-arctic-embed2
```

**Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull snowflake-arctic-embed2
```

**Verify:**

```bash
curl http://localhost:11434/api/tags
```

## Troubleshooting

### Plugin won't load

**Error:** `MEMORY_ALPHA_SQLITE_PATH is required`

**Fix:** Set the required environment variable before starting OpenClaw:

```bash
export MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db
openclaw gateway restart
```

### Vector search not working

**Symptom:** Only keyword search results, no semantic matches

**Check:**
1. Is Qdrant running? `curl http://<qdrant-url>:6333/collections`
2. Is Ollama running? `curl http://<ollama-url>:11434/api/tags`
3. Are both URLs configured in environment variables?
4. Check gateway logs for connection errors

### SQLite errors

**Error:** `Failed to initialize SQLite at /path/to/db`

**Common causes:**
- Directory doesn't exist (create parent directories first)
- No write permissions
- Disk full

**Fix:**

```bash
mkdir -p $(dirname $MEMORY_ALPHA_SQLITE_PATH)
touch $MEMORY_ALPHA_SQLITE_PATH
chmod 644 $MEMORY_ALPHA_SQLITE_PATH
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT

## Authors

USS Prometheus Engineering (Kei)
