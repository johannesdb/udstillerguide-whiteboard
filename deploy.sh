#!/usr/bin/env bash
set -euo pipefail

SERVER="udstillerguide"
REMOTE_DIR="/opt/udstillerguide-whiteboard"
BRANCH="main"

echo "==> Pushing to origin..."
git push origin "$BRANCH"

echo "==> Deploying to $SERVER..."
ssh "$SERVER" "sudo bash -c '
  cd $REMOTE_DIR &&
  git pull origin $BRANCH &&
  docker compose up -d --build app
'"

echo "==> Deploy complete!"
