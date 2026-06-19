#!/usr/bin/env bash
# tools/check-editor-boundaries.sh — Cross-platform editor boundary check
# Usage: bash tools/check-editor-boundaries.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIOLATIONS=0

# Use rg (ripgrep) if available, otherwise fall back to grep
if command -v rg &>/dev/null; then
  RG_AVAILABLE=true
else
  RG_AVAILABLE=false
fi

check_violations() {
  local dir="$1"
  local extra_args="${2:-}"

  if [ ! -d "$dir" ]; then
    return
  fi

  if [ "$RG_AVAILABLE" = true ]; then
    # Use rg for fast scanning
    rg -n '^\s*(import|export)\b' "$extra_args" "$dir" --type ts --type tsx 2>/dev/null | \
      grep -v 'components/editor-legacy' | \
      grep -E 'components/editor-legacy|stores/use-editor-store|SceneComposer|TimelinePanel|BlockLibraryPanel|PropertiesPanel' || true
  else
    # Fallback to find + grep
    find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path '*/editor-legacy/*' -print0 2>/dev/null | \
      xargs -0 grep -nE '^\s*(import|export)\b' 2>/dev/null | \
      grep -v 'components/editor-legacy' | \
      grep -E 'components/editor-legacy|stores/use-editor-store|SceneComposer|TimelinePanel|BlockLibraryPanel|PropertiesPanel' || true
  fi
}

echo "Checking editor boundaries..."

# Check app directory
VIOLATIONS_OUTPUT=$(check_violations "$REPO_ROOT/app")
if [ -n "$VIOLATIONS_OUTPUT" ]; then
  echo "$VIOLATIONS_OUTPUT"
  VIOLATIONS=1
fi

# Check components/editor directory (excluding editor-legacy)
VIOLATIONS_OUTPUT=$(check_violations "$REPO_ROOT/components/editor" "--glob '!**/editor-legacy/**'")
if [ -n "$VIOLATIONS_OUTPUT" ]; then
  echo "$VIOLATIONS_OUTPUT"
  VIOLATIONS=1
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "FAIL: editor boundary violation(s) found"
  exit 1
fi

echo "Editor boundary check passed."
