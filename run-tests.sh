#!/bin/bash
# Quick test runner script

echo "=== Visual Novel Engine Test Runner ==="
echo ""

echo "1. Installing vitest..."
cd "$(dirname "$0")"
pnpm add -D vitest @vitest/ui jsdom

echo ""
echo "2. Running unit tests..."
pnpm exec vitest run __tests__/unit/

echo ""
echo "3. Test run complete!"
echo ""
echo "To run with UI: pnpm exec vitest --ui"
echo "To run all tests: pnpm test"
