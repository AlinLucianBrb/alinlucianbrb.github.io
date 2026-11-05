#!/bin/sh
# Runs the SQL against a real, throwaway Postgres (14 or newer) before you paste it into Supabase:
#   createdb tbd_check && sh tools/sql-check/run.sh tbd_check      (use a NEW, empty database each time: dropdb tbd_check)
# It creates stand-ins for Supabase's auth (stub.sql), runs supabase-setup.sql, then supabase-update.sql twice (it must be safe
# to re-run), then plays a short session as a signed-in player (play.sql). Every "ERROR" printed by play.sql is a check the
# server is expected to refuse (wrong boss count, wrong slot...); anything else failing stops the script.
set -e
DB=${1:?usage: sh tools/sql-check/run.sh DATABASE}
cd "$(dirname "$0")/../.."
export PGOPTIONS='--client-min-messages=warning'   # hide the harmless "already exists, skipping" notices
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tools/sql-check/stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase-setup.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase-update.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase-update.sql
psql -q -d "$DB" -f tools/sql-check/play.sql
echo "SQL check finished."
