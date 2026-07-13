#!/bin/bash
set -e
echo "Checking if bucket exists..."
if aws --endpoint-url http://s3:9000 s3 ls s3://noname-assets 2>/dev/null; then
  echo "Bucket noname-assets already exists, skipping creation."
else
  echo "Creating bucket noname-assets..."
  aws --endpoint-url http://s3:9000 s3 mb s3://noname-assets
fi
