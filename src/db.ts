/**
 * Read OpenCode's SQLite database (read-only).
 * Uses a dual-runtime SQLite adapter (node:sqlite / bun:sqlite).
 */

import { openDb, type SqliteLike } from './sqlite.js'
import { existsSync } from 'node:fs'

export interface SessionRecord {
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
}

export interface MessageRecord {
  id: string
  sessionId: string
  role: string
  timeCreated: number
  text: string
}

export interface SessionText {
  sessionId: string
  text: string
}

export class OpenCodeDb {
  private db: SqliteLike

  constructor(dbPath: string) {
    if (!existsSync(dbPath)) {
      throw new Error(`OpenCode database not found: ${dbPath}`)
    }
    this.db = openDb(dbPath, true)
  }

  /** Get all sessions, newest first */
  getSessions(limit?: number): SessionRecord[] {
    const sql = `
      SELECT id, project_id, title, directory, model, agent, cost,
             tokens_input, tokens_output, time_created, time_updated
      FROM session
      ORDER BY time_created DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `
    const rows = this.db.prepare(sql).all() as Array<Record<string, unknown>>
    return rows.map(r => ({
      id: String(r['id']),
      projectId: String(r['project_id'] ?? ''),
      title: String(r['title'] ?? ''),
      directory: String(r['directory'] ?? ''),
      model: formatModel(r['model']),
      agent: String(r['agent'] ?? ''),
      cost: Number(r['cost'] ?? 0),
      tokensInput: Number(r['tokens_input'] ?? 0),
      tokensOutput: Number(r['tokens_output'] ?? 0),
      timeCreated: Number(r['time_created'] ?? 0),
      timeUpdated: Number(r['time_updated'] ?? 0),
    }))
  }

  /** Get a single session by id */
  getSession(id: string): SessionRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, project_id, title, directory, model, agent, cost,
                tokens_input, tokens_output, time_created, time_updated
         FROM session WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined

    if (!row) return undefined
    return {
      id: String(row['id']),
      projectId: String(row['project_id'] ?? ''),
      title: String(row['title'] ?? ''),
      directory: String(row['directory'] ?? ''),
      model: formatModel(row['model']),
      agent: String(row['agent'] ?? ''),
      cost: Number(row['cost'] ?? 0),
      tokensInput: Number(row['tokens_input'] ?? 0),
      tokensOutput: Number(row['tokens_output'] ?? 0),
      timeCreated: Number(row['time_created'] ?? 0),
      timeUpdated: Number(row['time_updated'] ?? 0),
    }
  }

  /** Get all messages for a session, oldest first */
  getMessages(sessionId: string): MessageRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, time_created, data
         FROM message WHERE session_id = ? ORDER BY time_created ASC`,
      )
      .all(sessionId) as Array<Record<string, unknown>>

    return rows.map(r => {
      let role = 'unknown'
      let text = ''
      try {
        const data = JSON.parse(String(r['data'])) as Record<string, unknown>
        role = String(data['role'] ?? 'unknown')
        text = this.getMessageText(String(r['id']))
      } catch {
        // ignore malformed data
      }
      return {
        id: String(r['id']),
        sessionId: String(r['session_id']),
        role,
        timeCreated: Number(r['time_created'] ?? 0),
        text,
      }
    })
  }

  /** Get concatenated text parts for a single message */
  getMessageText(messageId: string): string {
    const rows = this.db
      .prepare(
        `SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC`,
      )
      .all(messageId) as Array<Record<string, unknown>>

    const chunks: string[] = []
    for (const r of rows) {
      try {
        const data = JSON.parse(String(r['data'])) as Record<string, unknown>
        if (data['type'] === 'text' && typeof data['text'] === 'string') {
          chunks.push(data['text'])
        }
      } catch {
        // ignore malformed parts
      }
    }
    return chunks.join('\n')
  }

  /** Get concatenated text for a session (all parts) */
  getSessionText(sessionId: string): string {
    const rows = this.db
      .prepare(
        `SELECT data FROM part WHERE session_id = ? ORDER BY time_created ASC`,
      )
      .all(sessionId) as Array<Record<string, unknown>>

    const chunks: string[] = []
    for (const r of rows) {
      try {
        const data = JSON.parse(String(r['data'])) as Record<string, unknown>
        if (data['type'] === 'text' && typeof data['text'] === 'string') {
          chunks.push(data['text'])
        }
      } catch {
        // ignore malformed parts
      }
    }
    return chunks.join('\n')
  }

  /** Get all session texts (id → text) */
  getAllSessionTexts(): SessionText[] {
    const sessions = this.getSessions()
    return sessions.map(s => ({
      sessionId: s.id,
      text: this.getSessionText(s.id),
    }))
  }

  close(): void {
    this.db.close()
  }
}

/**
 * Normalize OpenCode's model field into a readable id.
 * Newer DBs store JSON like {"id":"deepseek-v4-flash","providerID":"opencode-go"};
 * older ones store a plain string like "opencode/deepseek-v4-flash".
 */
export function formatModel(raw: unknown): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        const id = String(parsed['id'] ?? '')
        const provider = String(parsed['providerID'] ?? '')
        if (id && provider) return `${provider}/${id}`
        if (id) return id
      } catch {
        // fall through to plain string
      }
    }
    return trimmed
  }
  return String(raw ?? '')
}