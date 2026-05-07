#!/usr/bin/env bash
# E2E smoke test (T2) — exercises the CLI without making network calls.
# Verifies: build, version, help, command catalog, MCP catalog, eval suite,
# spec parser, undo CLI, workspace CLI.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$REPO/packages/cli/dist/index.js"

if [[ ! -f "$CLI" ]]; then
  echo "[smoke] dist not found, building..." >&2
  (cd "$REPO" && pnpm -r build)
fi

run() {
  local label="$1"; shift
  if "$@" >/tmp/arix-smoke.out 2>&1; then
    echo "  ✓ $label"
  else
    echo "  ✗ $label"
    cat /tmp/arix-smoke.out
    return 1
  fi
}

assert_contains() {
  local needle="$1"; shift
  if grep -q "$needle" "$@"; then
    return 0
  fi
  echo "  ✗ output missing: $needle" >&2
  cat "$@" >&2
  return 1
}

echo "[smoke] CLI: $CLI"

run "version"             node "$CLI" --version
run "help"                node "$CLI" --help
run "mcp catalog"         node "$CLI" mcp catalog
node "$CLI" mcp catalog >/tmp/arix-smoke.out 2>&1 && assert_contains "filesystem" /tmp/arix-smoke.out

run "undo --list"         node "$CLI" undo --list
run "workspace list"      node "$CLI" workspace list
run "eval skill-regression" node "$CLI" eval --suite skill-regression

# Spec parsing
TMP=$(mktemp -d)
cat > "$TMP/feature.md" <<'EOF'
## Add login form
- [ ] Email field
- [ ] Password field

## Wire backend
- [ ] POST /login
EOF
run "spec expand"         node "$CLI" spec "$TMP/feature.md"
run "spec --diff"         node "$CLI" spec "$TMP/feature.md" --diff
node "$CLI" spec "$TMP/feature.md" --show >/tmp/arix-smoke.out 2>&1 && assert_contains "Add login form" /tmp/arix-smoke.out

# Cost preflight (no API call)
run "cost preflight"      node "$CLI" cost preflight "hello world" --provider anthropic --model claude-sonnet-4-6
run "cost models"         node "$CLI" cost models --tier simple

# Drift check on the spec we just expanded — should be ✓ ok
run "drift check (clean)" node "$CLI" drift check "$TMP/feature.md"

# Mutate spec; drift check should now exit 1
echo "- [ ] Add OAuth" >> "$TMP/feature.md"
if node "$CLI" drift check "$TMP/feature.md" >/tmp/arix-smoke.out 2>&1; then
  echo "  ✗ drift check should have failed after mutation"
  exit 1
else
  echo "  ✓ drift check (drifted) — exits non-zero as expected"
fi

# Redact: produce a file with a fake secret, verify --check fails
echo "TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789" > "$TMP/secrets.txt"
if node "$CLI" redact "$TMP/secrets.txt" --check >/tmp/arix-smoke.out 2>&1; then
  echo "  ✗ redact --check should have failed on secret"
  exit 1
else
  echo "  ✓ redact --check (with secret) — exits non-zero as expected"
fi

rm -rf "$TMP"

echo ""
echo "[smoke] all checks passed"
