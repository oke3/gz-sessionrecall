// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

/**
 * SQLite driver adapter — works in both Node (node:sqlite, 22.5+)
 * and Bun (bun:sqlite). Zero runtime dependencies.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface SqliteLike {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  }
  exec(sql: string): void
  close(): void
}

export type { SqliteLike }

/** Load the best available SQLite driver */
function loadDriver(): new (path: string, options?: Record<string, unknown>) => SqliteLike {
  try {
    // Node 22.5+: node:sqlite
    const mod = require('node:sqlite') as { DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteLike }
    return mod.DatabaseSync
  } catch {
    // Bun: bun:sqlite
    const mod = require('bun:sqlite') as { Database: new (path: string, options?: Record<string, unknown>) => SqliteLike }
    return mod.Database
  }
}

const Driver = loadDriver()

/** Open a SQLite database */
export function openDb(path: string, readOnly = false): SqliteLike {
  if (readOnly) {
    // node:sqlite uses readOnly, bun:sqlite uses readonly
    try {
      return new Driver(path, { readOnly: true })
    } catch {
      return new Driver(path, { readonly: true })
    }
  }
  return new Driver(path)
}