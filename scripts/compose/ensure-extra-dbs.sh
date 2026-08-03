#!/bin/sh
# Idempotent: create extra Postgres DBs on existing volumes (compose/init-dbs.sh only runs on first boot).
set -e

PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-noname}"
PGDATABASE="${PGDATABASE:-app}"
export PGPASSWORD="${PGPASSWORD:-noname_dev}"

for DB in zitadel nango keto; do
  EXISTS=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '${DB}'")
  if [ "$EXISTS" != "1" ]; then
    echo "Creating database ${DB}"
    psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "CREATE DATABASE ${DB}"
  else
    echo "Database ${DB} already exists"
  fi
done

for DB in app zitadel nango keto; do
  echo "Ensuring extensions in ${DB}"
  psql -h "$PGHOST" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOSQL
done

echo "Extra databases ready"
