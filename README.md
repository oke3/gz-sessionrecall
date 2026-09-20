# gz-sessionrecall

> AI code archaeology — index OpenCode sessions into a searchable, local-first knowledge base.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Ground Zero LLC](https://img.shields.io/badge/Built%20by-Ground%20Zero%20LLC-purple)](https://github.com/oke3)
[![npm](https://img.shields.io/npm/v/@ground-zero-llc/gz-sessionrecall)](https://www.npmjs.com/package/@ground-zero-llc/gz-sessionrecall)
[![CI](https://github.com/oke3/gz-sessionrecall/actions/workflows/ci.yml/badge.svg)](https://github.com/oke3/gz-sessionrecall/actions)

## Why

OpenCode stores every session — prompts, responses, reasoning, tool calls, costs — in a local SQLite database. That data is a goldmine, but it's locked inside relational tables with no search, no recall, no way to answer the questions that actually matter:

- **"How did we fix that bug last month?"** — full-text search over every session transcript
- **"Which model did we use for the auth refactor?"** — model and project filtering
- **"What did we spend on that feature?"** — cost tracking across sessions
- **"What was that architecture decision?"** — instant recall of past reasoning chains

**sessionrecall** reads OpenCode's database **read-only**, builds a local JSONL index, and gives you fast keyword search over everything you've ever done with OpenCode. No cloud. No telemetry. No external dependencies. Just your data, instantly searchable.

## Install

```bash
npm install -g @ground-zero-llc/gz-sessionrecall
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

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OpenCode Database                      │
│            (SQLite — session, message, part)             │
│                    READ-ONLY ────┐                       │
└──────────────────────────────────┼───────────────────────┘
                                   │
                          ┌────────▼────────┐
                          │   sessionrecall  │
                          │     CLI / API    │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌────────────┐ ┌───────────┐ ┌────────────┐
             │  OpenCodeDb │ │ Session   │ │  search()  │
             │ (db.ts)     │ │ Index     │ │ tokenizer  │
             │ read-only   │ │ (store.ts)│ │ scorer     │
             │ parser      │ │ JSONL     │ │ snippet()  │
             └─────┬───────┘ └─────┬─────┘ └──────┬─────┘
                   │               │               │
                   │        ~/.sessionrecall/      │
                   │         ├─ index.jsonl        │
                   │         └─ meta.json          │
                   │                               │
                   └───────────────┬───────────────┘
                                   │
                          IndexedSession[]
                     {id, title, model, text,
                      cost, tokens, project...}
```

**Pipeline:**
1. `OpenCodeDb` opens the SQLite database in read-only mode
2. `SessionIndex` rebuilds a JSONL index from all sessions and their concatenated text parts
3. `search()` tokenizes queries, scores sessions by term frequency, and returns ranked results
4. The index is stored locally in `~/.sessionrecall/` — nothing leaves your machine

## Feature Highlights

### Full-Text Search with Ranking

The search engine tokenizes your query and every session's text, then scores matches using term frequency. Title matches are weighted 3x higher than body matches, so session titles act as natural relevance signals. Prefix matching catches partial terms (`auth` matches `authentication`).

```bash
sessionrecall search "docker compose"
# → Ranked results with scores, snippets, cost, and model info
```

### Model Normalization

OpenCode stores the model field as JSON in newer databases (`{"id":"deepseek-v4-flash","providerID":"opencode-go"}`) and as a plain string in older ones. sessionrecall normalizes both into `provider/id` format so your searches and stats aren't confused by storage differences.

### Snippet Extraction

Every search result includes a contextual snippet — a window around the first match term in the session transcript. This lets you quickly verify relevance without loading the full session.

### Filter by Project, Model, or Time

Combine search with filters to narrow results:

```bash
sessionrecall search "refactor" --project my-app --model opencode-go/deepseek-v4-flash --since 30
```

### Cost and Token Tracking

`sessionrecall stats` aggregates across all indexed sessions, giving you per-model and per-project breakdowns of cost and token usage — a quick pulse on your OpenCode spend.

## CLI Reference

| Command | Description |
|---------|-------------|
| `index [--db <path>]` | Build the search index from OpenCode's database |
| `search <query>` | Full-text search over sessions |
| `show <session-id>` | Display a session's full transcript |
| `list` | List sessions (newest first) |
| `stats` | Index statistics: sessions, cost, tokens, models, projects |
| `models` | List all models in the index |
| `projects` | List all projects in the index |
| `health` | Check index status |

### Search Options

| Flag | Description |
|------|-------------|
| `--limit <n>` | Max results (default: 20) |
| `--project <id>` | Filter by project ID |
| `--model <id>` | Filter by model (e.g. `opencode-go/deepseek-v4-flash`) |
| `--since <days>` | Only sessions from the last N days |

### List Options

| Flag | Description |
|------|-------------|
| `--limit <n>` | Max sessions to list (default: 20) |
| `--project <id>` | Filter by project |
| `--model <id>` | Filter by model |

## Library API

```typescript
import { OpenCodeDb, SessionIndex, search, snippet } from '@ground-zero-llc/gz-sessionrecall'

// Read OpenCode's database (read-only)
const db = new OpenCodeDb('~/.local/share/opencode/opencode.db')
const sessions = db.getSessions()

// Build an index
const index = new SessionIndex('./data')
index.rebuild(
  sessions.map(s => ({ ...s, text: db.getSessionText(s.id) })),
)

// Search with filters
const results = search(index.getAll(), 'auth bug', {
  limit: 5,
  project: 'my-app',
  model: 'opencode-go/deepseek-v4-flash',
})
// → [{ session, score, matches }]

// Get a snippet for a result
const snip = snippet(results[0]!.session, 'auth bug')
// → "…fixed the token refresh by updating the session store to…"

db.close()
```

### Types

```typescript
interface IndexedSession {
  id: string
  projectId: string
  title: string
  directory: string
  model: string
  agent: string
  cost: number
  tokensInput: number
  tokensOutput: number
  timeCreated: number
  timeUpdated: number
  text: string
}

interface SearchResult {
  session: IndexedSession
  score: number
  matches: string[]
}

interface SearchOptions {
  limit?: number
  project?: string
  model?: string
  since?: number
}
```

## How Scoring Works

The scoring algorithm is simple but effective:

1. **Tokenization** — Both the query and session text are lowercased and split into word tokens. Punctuation and special characters are stripped; tokens shorter than 2 characters are dropped.

2. **Term frequency** — For each query term, the scorer counts exact matches in the session body (+1 each) and prefix matches where either side starts with the other (+0.5 each).

3. **Title boost** — Exact matches in the session title receive a +3 weight, making titles the strongest relevance signal.

4. **Ranking** — Sessions are sorted by descending score. Only sessions with score > 0 are returned.

This means a session where your query term appears in the title **and** multiple times in the body will rank much higher than one with a single body match.

## Privacy

**sessionrecall is local-first and privacy-by-design:**

- **Read-only** — The OpenCode database is never written to. Your session data stays exactly where OpenCode put it.
- **Local index** — The JSONL index lives in `~/.sessionrecall/` on your machine. No data is transmitted anywhere.
- **Zero telemetry** — No analytics, no phone-home, no tracking. The tool doesn't even make network requests.
- **No cloud dependency** — Everything runs offline. No API keys required. No accounts.
- **Your data, your control** — Delete `~/.sessionrecall/` at any time to wipe the index. The source database is untouched.

## Data Directory

Default: `~/.sessionrecall/`

| Variable | Default | Purpose |
|----------|---------|---------|
| `SESSIONRECALL_DATA_DIR` | `~/.sessionrecall` | Where the index lives |
| `OPENCODE_DB_PATH` | `~/.local/share/opencode/opencode.db` | OpenCode's SQLite database |

The OpenCode database is opened **read-only** — sessionrecall never writes to it.

## Related Projects

| Project | What It Does |
|---------|-------------|
| [gz-sessions](https://github.com/oke3/gz-sessions) | Persistent cross-session memory for AI agents |
| [gz-sessionrecall](https://github.com/oke3/gz-sessionrecall) | AI code archaeology — search your session history |
| [gz-codemap](https://github.com/oke3/gz-codemap) | Scan codebases → auto-generate project config |
| [gz-modelrouter](https://github.com/oke3/gz-modelrouter) | Intelligent LLM cost router — save 40-70% on bills |
| [gz-bench](https://github.com/oke3/gz-bench) | Standardized benchmark harness for AI coding agents |
| [gz-authmesh](https://github.com/oke3/gz-authmesh) | Unified credential mesh for AI providers |
| [gz-remote](https://github.com/oke3/gz-remote) | Drive AI coding agents on remote machines over SSH |
| [gz-context-engine](https://github.com/oke3/gz-context-engine) | Production-grade RAG context engine |

---

## Enterprise Support

Need this customized for your infrastructure? We offer:

- **Integration consulting** — Wire gz-sessionrecall into your workflow
- **Custom configuration** — Task-specific rules, models, and workflows for your team
- **Managed deployment** — We host and maintain your instance
- **Training workshops** — Hands-on sessions for your engineering team

[Book a 30-min call](https://www.grndxero.com/brief) · [See pricing](https://www.grndxero.com/pricing)

---

## License

MIT — Ground Zero LLC

---

Built by [Ground Zero LLC](https://github.com/oke3) — AI infrastructure for the agentic age.
