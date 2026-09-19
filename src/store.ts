// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

/**
 * JSONL-based index storage for session recall.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface IndexedSession {
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

export class SessionIndex {
  private indexPath: string
  private metaPath: string

  constructor(dataDir: string) {
    this.indexPath = join(dataDir, 'index.jsonl')
    this.metaPath = join(dataDir, 'meta.json')

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
  }

  /** Rebuild the index from scratch */
  rebuild(sessions: IndexedSession[]): void {
    const lines = sessions.map(s => JSON.stringify(s))
    writeFileSync(this.indexPath, lines.join('\n') + '\n', 'utf-8')
    writeFileSync(
      this.metaPath,
      JSON.stringify({
        count: sessions.length,
        updatedAt: new Date().toISOString(),
      }, null, 2),
      'utf-8',
    )
  }

  /** Append a single session to the index */
  append(session: IndexedSession): void {
    appendFileSync(this.indexPath, JSON.stringify(session) + '\n', 'utf-8')
  }

  /** Get all indexed sessions */
  getAll(): IndexedSession[] {
    if (!existsSync(this.indexPath)) return []
    const lines = readFileSync(this.indexPath, 'utf-8').split('\n').filter(Boolean)
    return lines.map(l => JSON.parse(l) as IndexedSession)
  }

  /** Get index metadata */
  getMeta(): { count: number; updatedAt: string } {
    if (!existsSync(this.metaPath)) return { count: 0, updatedAt: '' }
    try {
      return JSON.parse(readFileSync(this.metaPath, 'utf-8')) as { count: number; updatedAt: string }
    } catch {
      return { count: 0, updatedAt: '' }
    }
  }

  /** Get a single session by id */
  get(id: string): IndexedSession | undefined {
    return this.getAll().find(s => s.id === id)
  }

  /** Clear the index */
  clear(): void {
    writeFileSync(this.indexPath, '', 'utf-8')
    writeFileSync(this.metaPath, JSON.stringify({ count: 0, updatedAt: new Date().toISOString() }), 'utf-8')
  }
}