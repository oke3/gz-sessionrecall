// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { openDb } from '../src/sqlite.js'
import { OpenCodeDb } from '../src/db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let dir: string
let dbPath: string
let db: OpenCodeDb

/** Create a fixture OpenCode DB matching the real schema */
function createFixtureDb(path: string): void {
  const sqlite = openDb(path)

  sqlite.exec(`
    CREATE TABLE project (id text PRIMARY KEY, name text);
    CREATE TABLE session (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      workspace_id text,
      parent_id text,
      slug text NOT NULL,
      directory text NOT NULL,
      path text,
      title text NOT NULL,
      version text NOT NULL,
      share_url text,
      summary_additions integer,
      summary_deletions integer,
      summary_files integer,
      summary_diffs text,
      metadata text,
      cost real DEFAULT 0 NOT NULL,
      tokens_input integer DEFAULT 0 NOT NULL,
      tokens_output integer DEFAULT 0 NOT NULL,
      tokens_reasoning integer DEFAULT 0 NOT NULL,
      tokens_cache_read integer DEFAULT 0 NOT NULL,
      tokens_cache_write integer DEFAULT 0 NOT NULL,
      revert text,
      permission text,
      agent text,
      model text,
      time_created integer NOT NULL,
      time_updated integer NOT NULL,
      time_compacting integer,
      time_archived integer
    );
    CREATE TABLE message (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL,
      data text NOT NULL
    );
    CREATE TABLE part (
      id text PRIMARY KEY,
      message_id text NOT NULL,
      session_id text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL,
      data text NOT NULL
    );
  `)

  // Insert fixture data
  sqlite.prepare(`INSERT INTO project (id, name) VALUES (?, ?)`).run('proj_test', 'Test Project')

  const insertSession = sqlite.prepare(`
    INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, agent, model, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertSession.run('ses_1', 'proj_test', 'ses_1', '/tmp/test', 'Fix auth bug', '1.0', 0.01, 100, 50, 'build', JSON.stringify({ id: 'deepseek-v4-flash', providerID: 'opencode-go' }), 1_700_000_000_000, 1_700_000_000_100)
  insertSession.run('ses_2', 'proj_test', 'ses_2', '/tmp/test', 'Refactor store', '1.0', 0.02, 200, 100, 'build', 'opencode/gpt-5.1-codex', 1_700_000_100_000, 1_700_000_100_100)

  const insertMessage = sqlite.prepare(`
    INSERT INTO message (id, session_id, time_created, time_updated, data)
    VALUES (?, ?, ?, ?, ?)
  `)
  insertMessage.run('msg_1', 'ses_1', 1_700_000_000_000, 1_700_000_000_000, JSON.stringify({ role: 'user', time: { created: 1_700_000_000_000 } }))
  insertMessage.run('msg_2', 'ses_1', 1_700_000_000_100, 1_700_000_000_100, JSON.stringify({ role: 'assistant', time: { created: 1_700_000_000_100 } }))

  const insertPart = sqlite.prepare(`
    INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertPart.run('part_1', 'msg_1', 'ses_1', 1_700_000_000_000, 1_700_000_000_000, JSON.stringify({ type: 'text', text: 'Fix the auth bug please' }))
  insertPart.run('part_2', 'msg_2', 'ses_1', 1_700_000_000_100, 1_700_000_000_100, JSON.stringify({ type: 'text', text: 'The auth bug was a stale token. Refreshing on 401 fixes it.' }))
  insertPart.run('part_3', 'msg_2', 'ses_1', 1_700_000_000_200, 1_700_000_000_200, JSON.stringify({ type: 'reasoning', text: 'internal reasoning' }))

  sqlite.close()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sessionrecall-db-'))
  dbPath = join(dir, 'opencode.db')
  createFixtureDb(dbPath)
  db = new OpenCodeDb(dbPath)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('OpenCodeDb', () => {
  it('throws for missing db', () => {
    expect(() => new OpenCodeDb(join(dir, 'missing.db'))).toThrow()
  })

  it('gets all sessions newest first', () => {
    const sessions = db.getSessions()
    expect(sessions).toHaveLength(2)
    expect(sessions[0]!.id).toBe('ses_2')
    expect(sessions[1]!.id).toBe('ses_1')
  })

  it('gets session fields', () => {
    const s = db.getSession('ses_1')
    expect(s).toBeDefined()
    expect(s!.title).toBe('Fix auth bug')
    expect(s!.model).toBe('opencode-go/deepseek-v4-flash')
    expect(s!.cost).toBe(0.01)
    expect(s!.tokensInput).toBe(100)
    expect(s!.tokensOutput).toBe(50)
  })

  it('normalizes plain-string models', () => {
    const s = db.getSession('ses_2')
    expect(s!.model).toBe('opencode/gpt-5.1-codex')
  })

  it('gets session by id', () => {
    const s = db.getSession('ses_2')
    expect(s).toBeDefined()
    expect(s!.title).toBe('Refactor store')
  })

  it('returns undefined for missing session', () => {
    expect(db.getSession('ses_missing')).toBeUndefined()
  })

  it('gets messages for a session', () => {
    const messages = db.getMessages('ses_1')
    expect(messages).toHaveLength(2)
    expect(messages[0]!.role).toBe('user')
    expect(messages[1]!.role).toBe('assistant')
  })

  it('gets message text from parts', () => {
    const messages = db.getMessages('ses_1')
    const assistant = messages.find(m => m.role === 'assistant')
    expect(assistant!.text).toContain('stale token')
  })

  it('gets session text from all parts', () => {
    const text = db.getSessionText('ses_1')
    expect(text).toContain('Fix the auth bug please')
    expect(text).toContain('stale token')
    // Reasoning parts are excluded
    expect(text).not.toContain('internal reasoning')
  })

  it('gets all session texts', () => {
    const texts = db.getAllSessionTexts()
    expect(texts).toHaveLength(2)
    const ses1 = texts.find(t => t.sessionId === 'ses_1')
    expect(ses1!.text).toContain('auth bug')
  })
})