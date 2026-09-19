// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

#!/usr/bin/env node

/**
 * sessionrecall CLI — AI code archaeology for OpenCode sessions.
 */

import { OpenCodeDb } from './db.js'
import { SessionIndex, type IndexedSession } from './store.js'
import { search, snippet, listModels, listProjects } from './search.js'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_DATA_DIR = join(homedir(), '.sessionrecall')
const DEFAULT_DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db')

function getDataDir(): string {
  const dir = process.env['SESSIONRECALL_DATA_DIR'] ?? DEFAULT_DATA_DIR
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getDbPath(): string {
  return process.env['OPENCODE_DB_PATH'] ?? DEFAULT_DB_PATH
}

function printUsage(): void {
  console.log(`
sessionrecall — AI code archaeology for OpenCode sessions

Usage:
  sessionrecall <command> [options]

Commands:
  index [--db <path>]          Build the search index from OpenCode's DB
  search <query> [options]     Search indexed sessions
  show <session-id>            Show a session's full transcript
  list [options]               List sessions
  stats                        Show index statistics
  models                       List models in the index
  projects                     List projects in the index
  health                       Check index status

Options:
  --db <path>                  OpenCode DB path (default: ~/.local/share/opencode/opencode.db)
  --data-dir <path>            Index directory (default: ~/.sessionrecall)
  --limit <n>                  Max results (default: 20)
  --project <id>               Filter by project
  --model <id>                 Filter by model
  --since <days>               Only sessions from last N days

Examples:
  sessionrecall index
  sessionrecall search "auth bug"
  sessionrecall search "refactor" --limit 5
  sessionrecall show ses_abc123
  sessionrecall list --limit 10
  sessionrecall stats
  `)
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ')
}

function main(): void {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    return
  }

  const command = args[0]!
  const dataDir = getDataDir()
  const dbPath = getDbPath()

  switch (command) {
    case 'index': {
      const db = new OpenCodeDb(dbPath)
      const sessions = db.getSessions()
      const index = new SessionIndex(dataDir)

      const indexed: IndexedSession[] = sessions.map(s => ({
        id: s.id,
        projectId: s.projectId,
        title: s.title,
        directory: s.directory,
        model: s.model,
        agent: s.agent,
        cost: s.cost,
        tokensInput: s.tokensInput,
        tokensOutput: s.tokensOutput,
        timeCreated: s.timeCreated,
        timeUpdated: s.timeUpdated,
        text: db.getSessionText(s.id),
      }))

      index.rebuild(indexed)
      db.close()

      console.log(`Indexed ${indexed.length} sessions from ${dbPath}`)
      console.log(`Index: ${dataDir}`)
      break
    }

    case 'search': {
      const query = args[1]
      if (!query) {
        console.error('Usage: sessionrecall search <query>')
        process.exit(1)
      }

      const index = new SessionIndex(dataDir)
      const sessions = index.getAll()
      if (sessions.length === 0) {
        console.error('Index is empty. Run `sessionrecall index` first.')
        process.exit(1)
      }

      const options = {
        limit: parseInt(getArg(args, '--limit') ?? '20', 10),
        project: getArg(args, '--project'),
        model: getArg(args, '--model'),
        since: getArg(args, '--since') ? Date.now() - parseInt(getArg(args, '--since')!, 10) * 86_400_000 : undefined,
      }

      const results = search(sessions, query, options)
      if (results.length === 0) {
        console.log('No matches found.')
        return
      }

      console.log(`\n${results.length} result(s) for "${query}"\n`)
      for (const r of results) {
        const s = r.session
        console.log(`  ${s.id}`)
        console.log(`  ${s.title || '(untitled)'} — ${fmtDate(s.timeCreated)}`)
        console.log(`  model: ${s.model} | cost: $${s.cost.toFixed(4)} | score: ${r.score}`)
        console.log(`  ${snippet(s, query)}`)
        console.log('')
      }
      break
    }

    case 'show': {
      const id = args[1]
      if (!id) {
        console.error('Usage: sessionrecall show <session-id>')
        process.exit(1)
      }

      const index = new SessionIndex(dataDir)
      const session = index.get(id)
      if (!session) {
        console.error(`Session not found in index: ${id}`)
        process.exit(1)
      }

      console.log(`\nSession: ${session.id}`)
      console.log(`Title:   ${session.title || '(untitled)'}`)
      console.log(`Project: ${session.projectId}`)
      console.log(`Model:   ${session.model} | Agent: ${session.agent}`)
      console.log(`Created: ${fmtDate(session.timeCreated)}`)
      console.log(`Tokens:  ${session.tokensInput} in / ${session.tokensOutput} out`)
      console.log(`Cost:    $${session.cost.toFixed(4)}`)
      console.log('─'.repeat(60))
      console.log(session.text)
      break
    }

    case 'list': {
      const index = new SessionIndex(dataDir)
      const sessions = index.getAll()
      const limit = parseInt(getArg(args, '--limit') ?? '20', 10)
      const project = getArg(args, '--project')
      const model = getArg(args, '--model')

      let filtered = sessions
      if (project) filtered = filtered.filter(s => s.projectId === project)
      if (model) filtered = filtered.filter(s => s.model === model)
      filtered = filtered.slice(0, limit)

      console.log(`\n${filtered.length} session(s)\n`)
      for (const s of filtered) {
        console.log(`  ${s.id}  ${s.title || '(untitled)'.padEnd(20)}  ${fmtDate(s.timeCreated)}  ${s.model}  $${s.cost.toFixed(4)}`)
      }
      break
    }

    case 'stats': {
      const index = new SessionIndex(dataDir)
      const sessions = index.getAll()
      const meta = index.getMeta()

      console.log(`\nSessionRecall Index`)
      console.log('─'.repeat(50))
      console.log(`Sessions:    ${meta.count}`)
      console.log(`Last update: ${meta.updatedAt || 'never'}`)

      if (sessions.length > 0) {
        const totalCost = sessions.reduce((a, s) => a + s.cost, 0)
        const totalTokens = sessions.reduce((a, s) => a + s.tokensInput + s.tokensOutput, 0)
        const models = listModels(sessions)
        const projects = listProjects(sessions)

        console.log(`Total cost:  $${totalCost.toFixed(4)}`)
        console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
        console.log(`Models:      ${models.length}`)
        console.log(`Projects:    ${projects.length}`)

        console.log('\nBy model:')
        const modelCounts = new Map<string, number>()
        for (const s of sessions) {
          modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1)
        }
        for (const [m, c] of [...modelCounts.entries()].sort((a, b) => b[1] - a[1])) {
          console.log(`  ${m}: ${c}`)
        }

        console.log('\nBy project:')
        const projectCounts = new Map<string, number>()
        for (const s of sessions) {
          projectCounts.set(s.projectId, (projectCounts.get(s.projectId) ?? 0) + 1)
        }
        for (const [p, c] of [...projectCounts.entries()].sort((a, b) => b[1] - a[1])) {
          console.log(`  ${p}: ${c}`)
        }
      }
      break
    }

    case 'models': {
      const index = new SessionIndex(dataDir)
      const sessions = index.getAll()
      const models = listModels(sessions)
      console.log('\nModels in index:')
      for (const m of models) {
        console.log(`  ${m}`)
      }
      break
    }

    case 'projects': {
      const index = new SessionIndex(dataDir)
      const sessions = index.getAll()
      const projects = listProjects(sessions)
      console.log('\nProjects in index:')
      for (const p of projects) {
        console.log(`  ${p}`)
      }
      break
    }

    case 'health': {
      const index = new SessionIndex(dataDir)
      const meta = index.getMeta()
      console.log(JSON.stringify({
        status: meta.count > 0 ? 'indexed' : 'empty',
        sessions: meta.count,
        dataDir,
        dbPath,
      }, null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      printUsage()
      process.exit(1)
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  return args[idx + 1]
}

main()