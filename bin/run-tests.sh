#!/usr/bin/env bash
# Script: Run all automated checks with coverage
# Usage:  ./bin/run-tests.sh
# Needs:  local PostgreSQL running (./bin/start-dev.sh starts it)
# Output: coverage/backend/index.html and coverage/frontend/index.html

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==================================================="
echo " 1/3 Backend tests (pytest) with coverage"
echo "==================================================="
cd "$ROOT"
python3.13 -m pytest backend/tests -q \
  --cov --cov-config=.coveragerc \
  --cov-report=term-missing:skip-covered \
  --cov-report=html:coverage/backend

echo ""
echo "==================================================="
echo " 2/3 Frontend lint (ESLint)"
echo "==================================================="
cd "$ROOT/frontend"
npm run lint

echo ""
echo "==================================================="
echo " 3/3 Frontend tests (Vitest) with coverage"
echo "==================================================="
npx vitest run --coverage --coverage.reportsDirectory=../coverage/frontend

echo ""
echo "All checks passed. HTML coverage reports:"
echo "  coverage/backend/index.html"
echo "  coverage/frontend/index.html"
