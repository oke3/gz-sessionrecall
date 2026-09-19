// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

import { describe, it, expect, beforeEach } from 'bun:test'
import { SessionIndex } from '../src/store.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let dataDir: string
let index: SessionIndex

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sessionrecall-store-'))
  index = new SessionIndex(dataDir)
})

function makeSession(overrides: Partial<Parameters<SessionIndex['append']>[0]> = {}): Parameters<SessionIndex['append']>[0] {
  return {
    id: 'ses_test',
    projectId: 'proj_test',
    title: 'Test Session',
    directory: '/tmp/test',
    model: 'opencode/deepseek-v4-flash',
    agent: 'build',
    cost: 0.01,
    tokensInput: 100,
    tokensOutput: 50,
    timeCreated: 1_700_000_000_000,
    timeUpdated: 1_700_000_000_100,
    text: 'Hello world test content',
    ...overrides,
  }
}

describe('SessionIndex', () => {
  it('starts empty', () => {
    expect(index.getAll()).toHaveLength(0)
    expect(index.getMeta().count).toBe(0)
  })

  it('appends sessions', () => {
    index.append(makeSession())
    index.append(makeSession({ id: 'ses_2', title: 'Second' }))
    expect(index.getAll()).toHaveLength(2)
  })

  it('rebuild replaces all sessions', () => {
    index.append(makeSession({ id: 'ses_old' }))
    index.rebuild([makeSession({ id: 'ses_new' })])
    const all = index.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.id).toBe('ses_new')
  })

  it('rebuild updates meta', () => {
    index.rebuild([makeSession(), makeSession({ id: 'ses_2' })])
    const meta = index.getMeta()
    expect(meta.count).toBe(2)
    expect(meta.updatedAt).toBeTruthy()
  })

  it('get returns session by id', () => {
    index.append(makeSession({ id: 'ses_abc' }))
    const s = index.get('ses_abc')
    expect(s).toBeDefined()
    expect(s!.title).toBe('Test Session')
  })

  it('get returns undefined for missing', () => {
    const s = index.get('ses_missing')
    expect(s).toBeUndefined()
  })

  it('clear empties the index', () => {
    index.append(makeSession())
    index.clear()
    expect(index.getAll()).toHaveLength(0)
    expect(index.getMeta().count).toBe(0)
  })

  it('persists across instances', () => {
    index.append(makeSession({ id: 'ses_persist' }))
    const index2 = new SessionIndex(dataDir)
    expect(index2.getAll()).toHaveLength(1)
    expect(index2.get('ses_persist')).toBeDefined()
  })
})