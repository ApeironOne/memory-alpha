---
name: memory-alpha
description: Collective memory plugin (Qdrant + SQLite) with auto-capture + auto-recall.
metadata:
  {"openclaw": {"emoji": "🧠", "requires": {"services": ["qdrant"]}}}
---

# Memory Alpha

This is a **memory plugin**, not a normal skill. It replaces OpenClaw's memory slot so recall is automatic.

## Features
- Collective shared memory pool (multi-agent)
- Auto-capture hooks (message_received/message_sent)
- Auto-recall injection
- Hybrid retrieval (Qdrant + text + graph)

## Configuration (example)

```json
{
  "plugins": {
    "slots": { "memory": "memory-alpha" },
    "allow": ["memory-alpha"],
    "entries": {
      "memory-alpha": {
        "enabled": true,
        "config": {
          "qdrantUrl": "http://127.0.0.1:6333",
          "qdrantCollection": "memory_alpha",
          "sqlitePath": "~/.openclaw/memory/memory-alpha.db",
          "sharedPool": true,
          "autoCapture": true,
          "autoRecall": true,
          "recallLimit": 10
        }
      }
    }
  }
}
```

## Notes
- This plugin is designed for **multi-gateway use**. Use a shared Qdrant collection across hosts.
- Tag each memory with `agent_id`, `session_id`, and `source` to keep shared pool safe.

EOF
