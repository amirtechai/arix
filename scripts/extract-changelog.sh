#!/usr/bin/env bash
# Extract the release notes for a specific version from CHANGELOG.md
# Usage: ./scripts/extract-changelog.sh 0.1.0
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

CHANGELOG="${2:-CHANGELOG.md}"

awk -v ver="$VERSION" '
  /^\#\# \[/ {
    if (found) exit
    if (index($0, "["ver"]")) found=1
    next
  }
  found { print }
' "$CHANGELOG"
