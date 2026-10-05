#!/usr/bin/env bash
# Creates a fresh database with Supabase stand-ins and all migrations applied.
#   PSQL          psql command with superuser access (default: psql)
#   WAVE_TEST_DB  database name, dropped and recreated (default: wave_test)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
db="${WAVE_TEST_DB:-wave_test}"
read -r -a psql <<<"${PSQL:-psql}"

"${psql[@]}" -X -q -v ON_ERROR_STOP=1 -d postgres \
  -c "drop database if exists \"$db\" with (force)" -c "create database \"$db\""

apply() {
  echo "→ $(basename "$1")"
  "${psql[@]}" -X -q -v ON_ERROR_STOP=1 -d "$db" -o /dev/null -f "$1"
}

apply "$here/supabase_stubs.sql"
for migration in "$root"/migrations/*.sql; do
  apply "$migration"
done
