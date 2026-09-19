// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

import { describe, it, expect } from 'bun:test'
import { tokenize, scoreSession, search, snippet, listModels, listProjects } from '../src/search.js'
import type { IndexedSession } from '../src/store.js'

function makeSession(overrides: Partial<IndexedSession> = {}): IndexedSession {
  return {
    id: 'ses_test',
    projectId: 'proj_test',
    title: 'Fix auth bug',
    directory: '/tmp/test',
    model: 'opencode/deepseek-v4-flash',
    agent: 'build',
    cost: 0.01,
    tokensInput: 100,
    tokensOutput: 50,
    timeCreated: 1_700_000_000_000,
    timeUpdated: 1_700_000_000_100,
    text: 'The authentication bug was caused by a stale token in the session store. Fixed by refreshing the token on 401 responses.',
    ...overrides,
  }
}

describe('tokenize', () => {
  it('lowercases and splits words', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world'])
  })

  it('filters single-char tokens', () => {
    expect(tokenize('a b c hello')).toEqual(['hello'])
  })

  it('keeps code-ish tokens', () => {
    const tokens = tokenize('auth_token + api.v2 #comment')
    expect(tokens).toContain('auth_token')
    expect(tokens).toContain('api.v2')
  })

  it('handles empty input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('scoreSession', () => {
  it('scores matching terms', () => {
    const s = makeSession()
    const score = scoreSession(s, ['auth'])
    expect(score).toBeGreaterThan(0)
  })

  it('scores title matches higher', () => {
    const s = makeSession()
    const titleScore = scoreSession(s, ['fix'])
    const bodyScore = scoreSession(s, ['token'])
    expect(titleScore).toBeGreaterThan(bodyScore)
  })

  it('returns 0 for no match', () => {
    const s = makeSession()
    expect(scoreSession(s, ['zebra'])).toBe(0)
  })
})

describe('search', () => {
  it('finds matching sessions', () => {
    const sessions = [makeSession()]
    const results = search(sessions, 'auth bug')
    expect(results).toHaveLength(1)
    expect(results[0]!.session.id).toBe('ses_test')
  })

  it('returns empty for no match', () => {
    const sessions = [makeSession()]
    expect(search(sessions, 'zebra')).toHaveLength(0)
  })

  it('sorts by score descending', () => {
    const s1 = makeSession({ id: 'ses_1', text: 'nothing here' })
    const s2 = makeSession({ id: 'ses_2', text: 'auth auth auth token bug' })
    const results = search([s1, s2], 'auth')
    expect(results[0]!.session.id).toBe('ses_2')
  })

  it('respects limit', () => {
    const sessions = [
      makeSession({ id: 'ses_1' }),
      makeSession({ id: 'ses_2' }),
      makeSession({ id: 'ses_3' }),
    ]
    const results = search(sessions, 'auth', { limit: 2 })
    expect(results).toHaveLength(2)
  })

  it('filters by project', () => {
    const sessions = [
      makeSession({ id: 'ses_1', projectId: 'proj_a' }),
      makeSession({ id: 'ses_2', projectId: 'proj_b' }),
    ]
    const results = search(sessions, 'auth', { project: 'proj_a' })
    expect(results).toHaveLength(1)
    expect(results[0]!.session.id).toBe('ses_1')
  })

  it('filters by model', () => {
    const sessions = [
      makeSession({ id: 'ses_1', model: 'opencode/a' }),
      makeSession({ id: 'ses_2', model: 'opencode/b' }),
    ]
    const results = search(sessions, 'auth', { model: 'opencode/a' })
    expect(results).toHaveLength(1)
  })

  it('filters by since', () => {
    const now = Date.now()
    const sessions = [
      makeSession({ id: 'ses_old', timeCreated: now - 10 * 86_400_000 }),
      makeSession({ id: 'ses_new', timeCreated: now - 1 * 86_400_000 }),
    ]
    const results = search(sessions, 'auth', { since: now - 5 * 86_400_000 })
    expect(results).toHaveLength(1)
    expect(results[0]!.session.id).toBe('ses_new')
  })

  it('returns empty for empty query', () => {
    expect(search([makeSession()], '')).toHaveLength(0)
  })
})

describe('snippet', () => {
  it('extracts text around match', () => {
    const s = makeSession()
    const snip = snippet(s, 'token')
    expect(snip).toContain('token')
    expect(snip.length).toBeLessThan(s.text.length + 3)
  })

  it('returns start of text when no match', () => {
    const s = makeSession()
    const snip = snippet(s, 'zebra')
    expect(snip.length).toBeGreaterThan(0)
  })
})

describe('listModels / listProjects', () => {
  it('lists unique models', () => {
    const sessions = [
      makeSession({ id: 'ses_1', model: 'a' }),
      makeSession({ id: 'ses_2', model: 'b' }),
      makeSession({ id: 'ses_3', model: 'a' }),
    ]
    expect(listModels(sessions)).toEqual(['a', 'b'])
  })

  it('lists unique projects', () => {
    const sessions = [
      makeSession({ id: 'ses_1', projectId: 'x' }),
      makeSession({ id: 'ses_2', projectId: 'y' }),
    ]
    expect(listProjects(sessions)).toEqual(['x', 'y'])
  })
})