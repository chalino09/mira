#!/usr/bin/env sh
set -eu

# Rebuilds only the local Supabase database from supabase/migrations.
supabase start
supabase db reset --local
supabase migration list --local
supabase db lint --local

echo 'Fresh install completed. Run supabase/diagnostics/verify_deployed_schema.sql in the SQL Editor or with psql.'
