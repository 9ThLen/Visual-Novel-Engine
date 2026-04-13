# Wiki Schema - Visual Novel Engine Knowledge Base

## Purpose

This wiki is a persistent, LLM-maintained knowledge base for the Visual Novel Engine project. It compiles and synthesizes information from code, documentation, conversations, and external sources into an interlinked collection of markdown pages.

## Architecture

### Three Layers

1. **Raw Sources** - Immutable source materials (code files, docs, articles)
2. **Wiki** - LLM-generated markdown pages (this directory)
3. **Schema** - This file, defining structure and conventions

### Directory Structure

```
wiki/
├── SCHEMA.md              # This file - rules and conventions
├── index.md               # Content catalog with summaries
├── log.md                 # Chronological activity log
├── overview.md            # High-level project summary
├── entities/              # Components, systems, features
├── concepts/              # Patterns, architectures, ideas
├── sources/               # Processed source summaries
└── queries/               # Saved analyses and answers
```

## Page Types

### Entity Pages (entities/)
Individual components, systems, or features of the engine.

**Naming:** `component-name.md` (lowercase, hyphenated)

**Structure:**
```markdown
# Entity Name

## Overview
Brief description (2-3 sentences)

## Purpose
Why this exists, what problem it solves

## Implementation
Key technical details, file locations

## Dependencies
What it depends on, what depends on it

## Related
Links to related entities and concepts

## Sources
Links to source files and documentation
```

### Concept Pages (concepts/)
Architectural patterns, design principles, cross-cutting concerns.

**Naming:** `concept-name.md`

**Structure:**
```markdown
# Concept Name

## Definition
What this concept means in this project

## Application
How it's implemented across the codebase

## Examples
Concrete instances in the project

## Trade-offs
Design decisions and their implications

## Related
Links to entities that implement this concept
```

### Source Pages (sources/)
Summaries of processed source materials.

**Naming:** `source-type-name.md` (e.g., `readme-analysis.md`, `demo-story-structure.md`)

**Structure:**
```markdown
# Source: [Title]

**Type:** [Code/Documentation/Article/Conversation]
**Date Processed:** YYYY-MM-DD
**Location:** [File path or URL]

## Summary
Key points extracted

## Key Insights
Important findings or patterns

## Wiki Updates
List of entity/concept pages created or updated from this source
```

### Query Pages (queries/)
Saved answers to significant questions.

**Naming:** `descriptive-question.md`

**Structure:**
```markdown
# Query: [Question]

**Date:** YYYY-MM-DD
**Context:** Brief context if needed

## Answer
Synthesized answer with citations

## Related Pages
Links to relevant wiki pages

## Follow-up Questions
Potential areas for deeper investigation
```

## Special Files

### index.md
Content-oriented catalog. Updated on every ingest.

**Structure:**
```markdown
# Wiki Index

Last updated: YYYY-MM-DD

## Overview
- [overview.md](overview.md) - Project summary

## Entities (N pages)
- [entity-name](entities/entity-name.md) - One-line summary
...

## Concepts (N pages)
- [concept-name](concepts/concept-name.md) - One-line summary
...

## Sources (N pages)
- [source-name](sources/source-name.md) - One-line summary
...

## Queries (N pages)
- [query-name](queries/query-name.md) - One-line summary
...
```

### log.md
Chronological append-only record.

**Entry format:**
```markdown
## [YYYY-MM-DD HH:MM] operation | Title

Brief description of what happened.
- Pages created: [links]
- Pages updated: [links]
```

**Operations:** `ingest`, `query`, `lint`, `refactor`

## Workflows

### Ingest Workflow

When processing a new source:

1. **Read** the source material
2. **Discuss** key takeaways with user (optional, user preference)
3. **Create/Update** relevant entity and concept pages
4. **Create** a source summary page
5. **Update** index.md with new pages
6. **Append** entry to log.md
7. **Report** what was created/updated

### Query Workflow

When answering a question:

1. **Search** index.md for relevant pages
2. **Read** identified pages
3. **Synthesize** answer with citations
4. **Ask** user if answer should be filed as a query page
5. If yes, **create** query page and **update** index/log

### Lint Workflow

Periodic health check:

1. **Scan** all pages for:
   - Contradictions between pages
   - Stale information
   - Orphan pages (no inbound links)
   - Missing cross-references
   - Concepts mentioned but lacking pages
2. **Report** findings
3. **Suggest** fixes or new sources to investigate
4. **Update** pages as directed by user

## Conventions

### Cross-references
- Use relative links: `[entity name](../entities/entity-name.md)`
- Link liberally - connections are valuable
- Update backlinks when creating new pages

### Citations
- Format: `[source-name](../sources/source-name.md)`
- Include file paths for code references: `lib/story-context.tsx:45`

### Frontmatter (optional)
```yaml
---
tags: [tag1, tag2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [source1, source2]
---
```

### Writing Style
- Clear, concise, technical
- Present tense
- Active voice
- Assume reader is familiar with React Native/TypeScript
- Define domain-specific terms on first use

## Maintenance Principles

1. **Incremental** - Update pages as new information arrives
2. **Consistent** - Follow naming and structure conventions
3. **Connected** - Maintain cross-references
4. **Current** - Flag contradictions, update stale claims
5. **Discoverable** - Keep index.md accurate

## User Preferences

### Ingest Style
- **Interactive** - Discuss findings before filing (default)
- **Batch** - Process multiple sources with minimal interaction

### Query Filing
- **Selective** - Ask before creating query pages (default)
- **Automatic** - File all significant queries

### Update Frequency
- Update index.md on every ingest
- Append to log.md on every operation
- Run lint on user request

## Evolution

This schema will evolve as we discover what works. When conventions change:
1. Document the change here
2. Note it in log.md
3. Refactor existing pages if needed (or note inconsistency)

---

**Version:** 1.0
**Created:** 2026-04-13
**Last Updated:** 2026-04-13
