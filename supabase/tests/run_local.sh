#!/usr/bin/env bash
# Runs the migration and the RLS tests against a throwaway local Postgres.
# Needs Postgres 15+ binaries on PATH (or in /usr/lib/postgresql/*/bin).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="${bin:+$bin:}$PATH"

dir="$(mktemp -d)"
port=55432
cleanup() { pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT

if [ "$(id -u)" = 0 ]; then
  echo "Run as a non-root user (Postgres refuses to start as root)." >&2
  exit 1
fi

initdb -D "$dir/data" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=''" -l "$dir/log" -w start >/dev/null

psql_run() { psql -h "$dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -f "$here/local_stubs.sql"
psql_run -f "$root/supabase/migrations/0001_init.sql"
psql_run -f "$root/supabase/migrations/0001_init.sql"   # proves it can re-run
psql_run -f "$here/rls_test.sql"
