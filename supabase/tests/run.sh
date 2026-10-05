#!/usr/bin/env bash
# Applies all migrations to a fresh database and runs the SQL test suite.
#
#   PSQL       psql command with superuser access (default: psql)
#   WAVE_TEST_DB  scratch database name, dropped and recreated (default: wave_test)
#
# Example (local cluster, peer auth): PSQL="runuser -u postgres -- psql" pnpm db:test
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
db="${WAVE_TEST_DB:-wave_test}"
read -r -a psql <<<"${PSQL:-psql}"

"${psql[@]}" -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists \"$db\"" -c "create database \"$db\""

run() {
  echo "→ $(basename "$1")"
  "${psql[@]}" -X -q -v ON_ERROR_STOP=1 -d "$db" -o /dev/null -f "$1"
}

run "$here/supabase_stubs.sql"
for migration in "$root"/migrations/*.sql; do
  run "$migration"
done
for test in "$here"/*.test.sql; do
  run "$test"
done
echo "✓ database tests passed"
