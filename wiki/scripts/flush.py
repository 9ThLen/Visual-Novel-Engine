"""
Memory flush agent - extracts knowledge from conversations into daily logs.

Adapted from claude-memory-compiler for Visual Novel Engine wiki.
Uses Claude Agent SDK to extract important information from conversation context.
"""

from __future__ import annotations

import os
os.environ["CLAUDE_INVOKED_BY"] = "memory_flush"

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DAILY_DIR = ROOT / "wiki" / "daily"
SCRIPTS_DIR = ROOT / "wiki" / "scripts"
STATE_FILE = SCRIPTS_DIR / "last-flush.json"
LOG_FILE = SCRIPTS_DIR / "flush.log"

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def append_to_daily_log(content: str, section: str = "Session") -> None:
    """Append content to today's daily log."""
    today = datetime.now(timezone.utc).astimezone()
    log_path = DAILY_DIR / f"{today.strftime('%Y-%m-%d')}.md"

    if not log_path.exists():
        DAILY_DIR.mkdir(parents=True, exist_ok=True)
        log_path.write_text(
            f"# Daily Log: {today.strftime('%Y-%m-%d')}\n\n## Sessions\n\n",
            encoding="utf-8",
        )

    time_str = today.strftime("%H:%M")
    entry = f"### {section} ({time_str})\n\n{content}\n\n"

    with open(log_path, "a", encoding="utf-8") as f:
        f.write(entry)


async def run_flush(context: str) -> str:
    """Use Claude Agent SDK to extract important knowledge from conversation context."""
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        TextBlock,
        query,
    )

    prompt = f"""Review this Visual Novel Engine development conversation and extract important knowledge.

Format your response as a structured daily log entry:

**Context:** [One line about what was being worked on]

**Key Work:**
- [Important changes, features added, bugs fixed]

**Technical Decisions:**
- [Decisions made with rationale]

**Lessons Learned:**
- [Gotchas, patterns, insights discovered]

**Action Items:**
- [Follow-ups or TODOs]

Skip:
- Routine file reads/edits
- Trivial exchanges
- Obvious information

If nothing is worth saving, respond with: FLUSH_OK

## Conversation Context

{context}"""

    response = ""

    try:
        async for message in query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                cwd=str(ROOT),
                allowed_tools=[],
                max_turns=2,
            ),
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        response += block.text
    except Exception as e:
        import traceback
        logging.error("Agent SDK error: %s\n%s", e, traceback.format_exc())
        response = f"FLUSH_ERROR: {type(e).__name__}: {e}"

    return response


async def main_async(context_file: Path, session_id: str) -> None:
    """Main async entry point."""
    logging.info("Flush started: session=%s", session_id)

    if not context_file.exists():
        logging.error("Context file missing: %s", context_file)
        return

    context = context_file.read_text(encoding="utf-8")

    # Run flush
    result = await run_flush(context)

    if result.strip() == "FLUSH_OK":
        logging.info("Nothing to flush for session %s", session_id)
    elif result.startswith("FLUSH_ERROR"):
        logging.error("Flush failed: %s", result)
    else:
        append_to_daily_log(result)
        logging.info("Flushed session %s (%d chars)", session_id, len(result))

    # Clean up context file
    try:
        context_file.unlink()
    except Exception:
        pass


def main() -> None:
    if len(sys.argv) < 3:
        logging.error("Usage: flush.py <context_file> <session_id>")
        sys.exit(1)

    context_file = Path(sys.argv[1])
    session_id = sys.argv[2]

    asyncio.run(main_async(context_file, session_id))


if __name__ == "__main__":
    main()
