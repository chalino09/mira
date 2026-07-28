#!/usr/bin/env sh
set -eu

# Runs the committed migration chain against a fresh local Supabase database,
# then executes every dependency-free SQL regression test as the database owner.
./supabase/scripts/verify-fresh-install.sh

database_container="supabase_db_mira"
if ! docker container inspect "$database_container" >/dev/null 2>&1; then
  echo "Could not find the expected local Supabase database container: $database_container" >&2
  exit 1
fi

for test_file in supabase/tests/*.sql; do
  echo "Running $test_file"
  docker exec -i "$database_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$test_file"
done
