#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE app;
    CREATE DATABASE logto;
    CREATE DATABASE nango;
EOSQL
