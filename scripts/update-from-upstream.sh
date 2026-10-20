#!/usr/bin/env sh
# Merge the latest Clientflare into this checkout.
#
# Works for ordinary clones and for the copies the "Deploy to Cloudflare"
# button makes. Those start as a single squashed "source repo import" commit
# with no shared history, and with wrangler.jsonc/package.json edited by
# Cloudflare (worker name, database id, vars). This script finds the upstream
# commit that import was taken from, grafts the import onto it, and merges,
# so Cloudflare's edits survive and only real conflicts stop it.
#
#   sh scripts/update-from-upstream.sh        # then: git push
set -eu

UPSTREAM="${CLIENTFLARE_UPSTREAM:-https://github.com/sarequl/clientflare.git}"

git fetch --quiet "$UPSTREAM" main
up=$(git rev-parse FETCH_HEAD)

if git merge-base --is-ancestor "$up" HEAD; then
  echo "Already up to date."
  exit 0
fi

if git merge-base HEAD "$up" >/dev/null 2>&1; then
  git merge --no-edit "$up"
  exit 0
fi

echo "No shared history (deploy-button copy). Locating the upstream commit this copy was imported from…"
root=$(git rev-list --max-parents=0 HEAD | tail -n 1)
best=""
bestn=999999
for c in $(git rev-list --max-count=400 "$up"); do
  n=$(git diff --numstat "$c" "$root" | wc -l | tr -d ' ')
  if [ "$n" -lt "$bestn" ]; then bestn=$n; best=$c; fi
  [ "$n" -eq 0 ] && break
done
echo "Closest upstream commit: $(git log -1 --format='%h %s' "$best") ($bestn files differ, Cloudflare's edits)"

git replace --graft "$root" "$best"
cleanup() { git replace -d "$root" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if ! git merge --no-edit "$up"; then
  echo ""
  echo "Merge conflicts. Resolve them, then: git commit && git push"
  exit 1
fi
echo "Merged. Now: git push"
