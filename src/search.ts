/**
 * Search over indexed sessions — tokenizer + scoring.
 */

import type { IndexedSession } from './store.js'

export interface SearchOptions {
  limit?: number
  project?: string
  model?: string
  since?: number
}

export interface SearchResult {
  session: IndexedSession
  score: number
  matches: string[]
}

/** Tokenize text into lowercase word tokens */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_+#.-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

/** Simple scoring: count of query term occurrences */
export function scoreSession(session: IndexedSession, terms: string[]): number {
  const tokens = tokenize(session.text)
  const titleTokens = tokenize(session.title)
  let score = 0

  for (const term of terms) {
    for (const t of tokens) {
      if (t === term) score += 1
      else if (t.startsWith(term) || term.startsWith(t)) score += 0.5
    }
    for (const t of titleTokens) {
      if (t === term) score += 3
    }
  }

  return score
}

/** Search across all sessions */
export function search(
  sessions: IndexedSession[],
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []

  const results: SearchResult[] = []

  for (const session of sessions) {
    // Apply filters
    if (options.project && session.projectId !== options.project) continue
    if (options.model && session.model !== options.model) continue
    if (options.since && session.timeCreated < options.since) continue

    const score = scoreSession(session, terms)
    if (score > 0) {
      const matches = terms.filter(t =>
        tokenize(session.text).some(tok => tok === t || tok.startsWith(t) || t.startsWith(tok)),
      )
      results.push({ session, score, matches })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, options.limit ?? 20)
}

/** Extract a snippet around the first match */
export function snippet(session: IndexedSession, query: string, radius = 120): string {
  const terms = tokenize(query)
  if (terms.length === 0) return session.text.slice(0, radius * 2)

  const lower = session.text.toLowerCase()
  let bestIdx = -1
  let bestScore = 0

  for (const term of terms) {
    const idx = lower.indexOf(term)
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx
      bestScore = 1
    }
  }

  if (bestIdx === -1) return session.text.slice(0, radius * 2)

  const start = Math.max(0, bestIdx - radius)
  const end = Math.min(session.text.length, bestIdx + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < session.text.length ? '…' : ''
  return prefix + session.text.slice(start, end).replace(/\n+/g, ' ') + suffix
}

/** Get unique models in the index */
export function listModels(sessions: IndexedSession[]): string[] {
  return [...new Set(sessions.map(s => s.model).filter(Boolean))].sort()
}

/** Get unique projects in the index */
export function listProjects(sessions: IndexedSession[]): string[] {
  return [...new Set(sessions.map(s => s.projectId).filter(Boolean))].sort()
}