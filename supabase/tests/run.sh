#!/usr/bin/env bash
# Applies all migrations to a fresh database and runs the SQL test suite.
# Example (local cluster, peer auth): PSQL="runuser -u postgres -- psql" pnpm db:test
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
db="${WAVE_TEST_DB:-wave_test}"
read -r -a psql <<<"${PSQL:-psql}"

bash "$here/prepare.sh"
for test in "$here"/*.test.sql; do
  echo "→ $(basename "$test")"
  "${psql[@]}" -X -q -v ON_ERROR_STOP=1 -d "$db" -o /dev/null -f "$test"
done
echo "✓ database tests passed"
