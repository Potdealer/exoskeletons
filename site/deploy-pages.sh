#!/bin/bash
# Deploy all inlined site pages to storedon.net via Net Protocol
# Requires: PRIVATE_KEY in .env, node, npx @net-protocol/cli

set -e
cd "$(dirname "$0")/.."
source .env

CHAIN_ID=8453
DIST="site/dist"

# Map: filename -> storage key
declare -A PAGES
PAGES[index.html]=exo-home
PAGES[mint.html]=exo-mint
PAGES[explorer.html]=exo-explorer
PAGES[token.html]=exo-token
PAGES[messages.html]=exo-messages
PAGES[modules.html]=exo-modules
PAGES[marketplace.html]=exo-marketplace
PAGES[trust.html]=exo-trust
PAGES[docs.html]=exo-docs
PAGES[guide.html]=exo-guide
PAGES[minting-guide.html]=exo-minting-guide
PAGES[exo-token.html]=exo-exo-token
PAGES[outlier.html]=exo-outlier
PAGES[board.html]=exo-board-v10
# Agent Outlier Farcaster Mini App — upload separately from outlier-ai/miniapp/:
# npx @net-protocol/cli@latest storage upload --key outlier-play --file /mnt/e/Ai\ Agent/Projects/Outlier/outlier-ai/miniapp/farcaster.html --chain-id 8453 --private-key "$PRIVATE_KEY"

TOTAL=${#PAGES[@]}
COUNT=0
FAILED=0

echo "Deploying $TOTAL pages to storedon.net (Base $CHAIN_ID)..."
echo ""

for FILE in "${!PAGES[@]}"; do
  KEY="${PAGES[$FILE]}"
  COUNT=$((COUNT + 1))
  FILEPATH="$DIST/$FILE"

  if [ ! -f "$FILEPATH" ]; then
    echo "[$COUNT/$TOTAL] SKIP: $FILE (not found in dist/)"
    continue
  fi

  SIZE=$(wc -c < "$FILEPATH" | tr -d ' ')
  SIZE_KB=$((SIZE / 1024))
  echo "[$COUNT/$TOTAL] Uploading $FILE → $KEY (${SIZE_KB}KB)..."

  if npx @net-protocol/cli@latest storage upload \
    --file "$FILEPATH" \
    --key "$KEY" \
    --text "Exoskeletons - $FILE" \
    --chain-id $CHAIN_ID \
    --private-key "$PRIVATE_KEY" 2>&1; then
    echo "  ✓ $KEY uploaded"
  else
    echo "  ✗ $KEY FAILED"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "Done. $((TOTAL - FAILED))/$TOTAL pages deployed."
if [ $FAILED -gt 0 ]; then
  echo "WARNING: $FAILED page(s) failed to upload."
fi
