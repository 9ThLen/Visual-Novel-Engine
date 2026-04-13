# Visual Novel Engine Wiki

LLM-maintained knowledge base for the Visual Novel Engine project.

## 📖 What is this?

A persistent, compounding knowledge base that captures and organizes everything about the Visual Novel Engine project:
- **Entities** - Components, systems, features
- **Concepts** - Patterns, architectures, design principles
- **Sources** - Processed documentation and code
- **Queries** - Saved analyses and answers
- **Daily Logs** - Automatic conversation capture

## 🚀 Quick Start with Obsidian

### 1. Install Obsidian
Download from: https://obsidian.md/

### 2. Open this Wiki
1. Launch Obsidian
2. Click "Open folder as vault"
3. Select this `wiki/` directory
4. Click "Trust author and enable plugins"

### 3. Explore
- **Graph View** (Ctrl+G) - See connections between pages
- **File Explorer** (left sidebar) - Browse by category
- **Search** (Ctrl+Shift+F) - Find anything
- **Quick Switcher** (Ctrl+O) - Jump to any page

## 📁 Structure

```
wiki/
├── overview.md           # Project summary (start here!)
├── index.md              # Master catalog
├── log.md                # Activity timeline
├── SCHEMA.md             # Wiki rules and conventions
│
├── entities/             # Components and systems
│   ├── story-engine.md
│   ├── save-system.md
│   └── ...
│
├── concepts/             # Patterns and architecture
│   ├── branching-narrative.md
│   └── ...
│
├── sources/              # Processed materials
│   ├── readme-analysis.md
│   └── ...
│
├── queries/              # Saved Q&A
│   └── ...
│
├── daily/                # Auto-generated conversation logs
│   ├── 2026-04-13.md
│   └── ...
│
└── .obsidian/            # Obsidian configuration
```

## 🎨 Graph View Colors

- 🔵 **Blue** - Entities (components, systems)
- 🟡 **Yellow** - Concepts (patterns, principles)
- 🟢 **Green** - Sources (documentation, code)
- 🟣 **Purple** - Queries (Q&A, analyses)
- ⚪ **White** - Daily logs (conversations)

## 🤖 How it Works

### Automatic Capture
When a Claude Code session ends:
1. SessionEnd hook captures the conversation
2. Claude Agent SDK extracts important knowledge
3. Appends to `daily/YYYY-MM-DD.md`

### Manual Curation
The LLM (me!) processes sources and creates:
- Entity pages for components
- Concept pages for patterns
- Cross-references between pages
- Updates to index and log

### You Read, I Write
- **You:** Browse, search, follow links, ask questions
- **Me:** Create pages, update content, maintain consistency

## 📊 Recommended Plugins

Install these Obsidian community plugins for better experience:

1. **Dataview** - Query and display wiki metadata
2. **Graph Analysis** - Advanced graph statistics
3. **Recent Files** - Quick access to recent pages
4. **Tag Wrangler** - Manage tags efficiently
5. **Outliner** - Better list editing

## 🔍 Tips

### Finding Information
- Use **Graph View** to see relationships
- Use **Search** for keywords
- Start with `index.md` for catalog
- Check `log.md` for recent activity

### Understanding Links
- `[[page-name]]` - Internal wiki link
- `[text](url)` - External link
- Hover over links to see preview

### Daily Logs
- Auto-generated from conversations
- Chronological record of work
- Source material for entity/concept pages

## 🛠️ Maintenance

The wiki maintains itself through:
- **Ingest** - Processing new sources
- **Query** - Answering questions, filing results
- **Lint** - Health checks for consistency

All maintenance is done by the LLM automatically.

## 📝 Contributing

This wiki is LLM-maintained. To add knowledge:
1. Have conversations with Claude Code
2. Ask questions about the project
3. Request specific sources to be processed

The wiki will automatically capture and organize the information.

## 🔗 Related

- [Main Project README](../README.md)
- [SCHEMA.md](SCHEMA.md) - Detailed wiki conventions
- [overview.md](overview.md) - Project summary

---

**Last Updated:** 2026-04-13
**Status:** Active, auto-capturing conversations
**Pages:** 1 entity, 0 concepts, 0 sources, 0 queries
