#!/usr/bin/env bash
# Migrates a fresh database and runs the edge-function integration tests against it.
#   PSQL                     psql command with superuser access (default: psql)
#   WAVE_TEST_DATABASE_URL   connection URL for the same server (default below)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export WAVE_TEST_DB="${WAVE_TEST_DB:-wave_it}"
export WAVE_TEST_DATABASE_URL="${WAVE_TEST_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/$WAVE_TEST_DB}"
bash "$here/prepare.sh" >/dev/null
cd "$here/../functions"
pnpm exec vitest run test
