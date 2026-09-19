// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

/**
 * @ground-zero-llc/gz-sessionrecall — AI code archaeology for OpenCode sessions.
 *
 * @example
 * ```typescript
 * import { OpenCodeDb, SessionIndex, search } from '@ground-zero-llc/gz-sessionrecall'
 *
 * const db = new OpenCodeDb('~/.local/share/opencode/opencode.db')
 * const index = new SessionIndex('./data')
 *
 * // Build the index
 * const sessions = db.getSessions().map(s => ({
 *   ...s,
 *   text: db.getSessionText(s.id),
 * }))
 * index.rebuild(sessions)
 *
 * // Search
 * const results = search(index.getAll(), 'auth bug')
 * ```
 */

export { OpenCodeDb, type SessionRecord, type MessageRecord, type SessionText } from './db.js'
export { SessionIndex, type IndexedSession } from './store.js'
export { search, scoreSession, tokenize, snippet, listModels, listProjects, type SearchOptions, type SearchResult } from './search.js'