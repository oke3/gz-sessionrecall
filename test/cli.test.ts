// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { execSync } from 'node:child_process'
import { openDb } from '../src/sqlite.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts')

let dir: string
let dbPath: string
let dataDir: string

function run(args: string): string {
  return execSync(
    `bun run ${CLI} ${args}`,
    {
      env: {
        ...process.env,
        SESSIONRECALL_DATA_DIR: dataDir,
        OPENCODE_DB_PATH: dbPath,
      },
      encoding: 'utf-8',
      timeout: 10_000,
    },
  ).trim()
}

function createFixtureDb(path: string): void {
  const sqlite = openDb(path)
  sqlite.exec(`
    CREATE TABLE project (id text PRIMARY KEY, name text);
    CREATE TABLE session (
      id text PRIMARY KEY, project_id text NOT NULL, slug text NOT NULL,
      directory text NOT NULL, title text NOT NULL, version text NOT NULL,
      cost real DEFAULT 0 NOT NULL, tokens_input integer DEFAULT 0 NOT NULL,
      tokens_output integer DEFAULT 0 NOT NULL, agent text, model text,
      time_created integer NOT NULL, time_updated integer NOT NULL
    );
    CREATE TABLE message (
      id text PRIMARY KEY, session_id text NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
    );
    CREATE TABLE part (
      id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
    );
  `)
  sqlite.prepare(`INSERT INTO project (id, name) VALUES (?, ?)`).run('proj_test', 'Test')
  sqlite.prepare(`
    INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, agent, model, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ses_1', 'proj_test', 'ses_1', '/tmp', 'Fix auth bug', '1.0', 0.01, 100, 50, 'build', 'opencode/deepseek-v4-flash', 1_700_000_000_000, 1_700_000_000_100)
  sqlite.prepare(`
    INSERT INTO message (id, session_id, time_created, time_updated, data)
    VALUES (?, ?, ?, ?, ?)
  `).run('msg_1', 'ses_1', 1_700_000_000_000, 1_700_000_000_000, JSON.stringify({ role: 'user' }))
  sqlite.prepare(`
    INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('part_1', 'msg_1', 'ses_1', 1_700_000_000_000, 1_700_000_000_000, JSON.stringify({ type: 'text', text: 'The auth bug was a stale token.' }))
  sqlite.close()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sessionrecall-cli-'))
  dbPath = join(dir, 'opencode.db')
  dataDir = join(dir, 'data')
  createFixtureDb(dbPath)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('CLI', () => {
  it('shows help with no args', () => {
    const output = run('')
    expect(output).toContain('sessionrecall')
    expect(output).toContain('Usage')
  })

  it('health shows empty before index', () => {
    const output = run('health')
    const body = JSON.parse(output) as { status: string; sessions: number }
    expect(body.status).toBe('empty')
    expect(body.sessions).toBe(0)
  })

  it('index builds the index', () => {
    const output = run('index')
    expect(output).toContain('Indexed 1 sessions')
  })

  it('search finds sessions after index', () => {
    run('index')
    const output = run('search auth')
    expect(output).toContain('ses_1')
    expect(output).toContain('auth')
  })

  it('search returns no matches for unknown term', () => {
    run('index')
    const output = run('search zebra')
    expect(output).toContain('No matches')
  })

  it('show displays session transcript', () => {
    run('index')
    const output = run('show ses_1')
    expect(output).toContain('Fix auth bug')
    expect(output).toContain('stale token')
  })

  it('list shows sessions', () => {
    run('index')
    const output = run('list')
    expect(output).toContain('ses_1')
  })

  it('stats shows index statistics', () => {
    run('index')
    const output = run('stats')
    expect(output).toContain('Sessions:')
    expect(output).toContain('1')
  })

  it('models lists models', () => {
    run('index')
    const output = run('models')
    expect(output).toContain('opencode/deepseek-v4-flash')
  })

  it('projects lists projects', () => {
    run('index')
    const output = run('projects')
    expect(output).toContain('proj_test')
  })
})