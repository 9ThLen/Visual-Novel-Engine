# Wiki Activity Log

Chronological record of all wiki operations.

---

## [2026-04-13 21:11] ingest | Wiki System Initialization

Created initial wiki structure for Visual Novel Engine project.

**Operation:** Bootstrap wiki system
**Pages created:**
- [SCHEMA.md](SCHEMA.md) - Wiki rules and conventions
- [index.md](index.md) - Content catalog
- [log.md](log.md) - This file

**Directories created:**
- `entities/` - Component and system pages
- `concepts/` - Pattern and architecture pages
- `sources/` - Processed source summaries
- `queries/` - Saved analyses

**Next steps:**
- Create overview.md with project summary
- Begin ingesting existing documentation and code

---

## [2026-04-13 21:23] ingest | Memory Compiler Integration

Integrated automated memory system from claude-memory-compiler.

**Operation:** Hybrid automation setup
**Components added:**
- `hooks/session-end.py` - Captures conversation transcripts
- `scripts/flush.py` - Extracts knowledge using Claude Agent SDK
- `daily/` - Daily conversation logs (auto-generated)
- `.claude/settings.json` - SessionEnd hook configuration
- Python dependencies via uv (claude-agent-sdk, etc.)

**How it works:**
1. SessionEnd hook captures conversation transcript
2. Extracts last 30 turns (max 15k chars)
3. Spawns flush.py in background
4. Claude Agent SDK extracts important knowledge
5. Appends to daily/YYYY-MM-DD.md

**Benefits:**
- Automatic knowledge capture from conversations
- No manual note-taking required
- Persistent memory across sessions
- Compounding knowledge base

**Status:** Hooks active, will capture next session end
