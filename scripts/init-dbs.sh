#!/bin/bash
set -e

# create extra DBs if they don't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE logto' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logto')\gexec
    SELECT 'CREATE DATABASE nango' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nango')\gexec
EOSQL

# enable common extensions for each DB
for DB in app logto nango; do
  echo "Enabling extensions in $DB"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<-EOSQL
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOSQL
done