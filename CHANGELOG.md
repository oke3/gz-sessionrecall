# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-27

### Added
- Read-only access to OpenCode's SQLite database (session, message, part tables)
- Dual-runtime SQLite adapter (`node:sqlite` / `bun:sqlite`) with zero dependencies
- JSONL-based search index with metadata (index.jsonl + meta.json)
- Full-text search with title-weighted scoring, project/model/since filters, and snippets
- CLI with index, search, show, list, stats, models, projects, and health commands
- Model normalization for both plain-string and JSON model fields
- 47 tests covering db, store, search, and CLI