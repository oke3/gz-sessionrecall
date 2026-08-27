# opencode-sessionrecall

AI code archaeology for OpenCode — index your sessions into a searchable, local-first knowledge base.

[![CI](https://github.com/oke3/opencode-sessionrecall/actions/workflows/ci.yml/badge.svg)](https://github.com/oke3/opencode-sessionrecall/actions)
[![npm](https://img.shields.io/npm/v/@oke3/opencode-sessionrecall)](https://www.npmjs.com/package/@oke3/opencode-sessionrecall)
[![license](https://img.shields.io/npm/l/@oke3/opencode-sessionrecall)](https://github.com/oke3/opencode-sessionrecall/blob/main/LICENSE)

## Why

OpenCode stores every session — prompts, responses, reasoning, costs — in a local SQLite database. That data is a goldmine:

- **"How did we fix that bug last month?"** — searchable full-text over every session
- **"Which model did we use for X?"** — model and project analytics
- **"What did we spend?"** — cost tracking across sessions
- **"What was that decision?"** — instant recall of past reasoning

**sessionrecall** reads OpenCode's database read-only, builds a local JSONL index, and gives you fast keyword search over everything you've ever done with OpenCode. No cloud, no telemetry, no dependencies.

## Install

```bash
npm install -g @oke3/opencode-sessionrecall
```

Requires Node 22.5+ (uses `node:sqlite`; falls back to `bun:sqlite` under Bun).

## Quick Start

```bash
# Build the index from your OpenCode database
sessionrecall index
# → Indexed 314 sessions from ~/.local/share/opencode/opencode.db

# Search everything
sessionrecall search "auth bug"
# → 3 result(s) for "auth bug"
# →   ses_fe4302838ffe3WoaBEceKryzcI  Fix auth token refresh in session store
# →   model: opencode-go/deepseek-v4-flash | cost: $0.7113 | score: 206

# Show a full session transcript
sessionrecall show ses_fe4302838ffe3WoaBEceKryzcI

# List recent sessions
sessionrecall list --limit 10

# Index statistics
sessionrecall stats
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `index` | Build the search index from the OpenCode database |
| `search <query>` | Full-text search over sessions (`--limit`, `--project`, `--model`, `--since`) |
| `show <session-id>` | Display a session's full transcript |
| `list` | List sessions (`--limit`, `--project`, `--model`) |
| `stats` | Index statistics: sessions, cost, tokens, models, projects |
| `models` | List all models used |
| `projects` | List all projects |
| `health` | Check index status |

## Library API

```typescript
import { OpenCodeDb, SessionIndex, search } from '@oke3/opencode-sessionrecall'

// Read OpenCode's database (read-only)
const db = new OpenCodeDb('~/.local/share/opencode/opencode.db')

// Build an index
const index = new SessionIndex('./data')
index.rebuild(
  db.getSessions().map(s => ({ ...s, text: db.getSessionText(s.id) })),
)

// Search
const results = search(index.getAll(), 'auth bug', { limit: 5 })
// → [{ session, score, snippet }]
```

## Data Directory

Default: `~/.sessionrecall/`

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SESSIONRECALL_DATA_DIR` | `~/.sessionrecall` | Where the index lives |
| `OPENCODE_DB_PATH` | `~/.local/share/opencode/opencode.db` | OpenCode's SQLite database |

The OpenCode database is opened **read-only** — sessionrecall never writes to it.

## How It Works

1. `index` reads the OpenCode SQLite database (`session`, `message`, `part` tables)
2. Text parts are concatenated per session and stored as JSONL (`index.jsonl`) with metadata (`meta.json`)
3. `search` tokenizes the query and scores sessions by term frequency, with title matches weighted higher
4. Everything stays on your machine — local-first, zero telemetry

## Related Projects

- [opencode-sessions](https://github.com/oke3/opencode-sessions) — Persistent cross-session memory for OpenCode agents
- [opencode-codemap](https://github.com/oke3/opencode-codemap) — Codebase mapping for OpenCode
- [opencode-bench](https://github.com/oke3/opencode-bench) — Benchmarking suite for OpenCode
- [opencode-remote](https://github.com/oke3/opencode-remote) — Drive OpenCode over SSH
- [opencode-modelrouter](https://github.com/oke3/opencode-modelrouter) — Intelligent LLM cost router for OpenCode

## License

MIT © oke3