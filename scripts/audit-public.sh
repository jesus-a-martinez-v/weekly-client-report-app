#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

fail=0

tracked_files="$(mktemp)"
trap 'rm -f "$tracked_files"' EXIT
git ls-files -- ':!package-lock.json' ':!scripts/audit-public.sh' > "$tracked_files"

echo "[audit-public] scanning tracked files"

if git ls-files --error-unmatch src/prompts/narrative.md >/dev/null 2>&1; then
  echo "[audit-public] private prompt is tracked: src/prompts/narrative.md" >&2
  fail=1
fi

deny_regex='(/root/|/home/[^/]+/|postgresql://[^[:space:]]+@|mongodb(\+srv)?://[^[:space:]]+@|mysql://[^[:space:]]+@|redis://[^[:space:]]+@|webhook/[-A-Za-z0-9_/]+|SNI rule|TLS negotiation|DNS A record|server address|self-signed cert|OAuth credential)'
if xargs -a "$tracked_files" rg -n -i --hidden --glob '!package-lock.json' "$deny_regex"; then
  echo "[audit-public] private identifier or infrastructure detail found" >&2
  fail=1
fi

if [ -n "${AUDIT_PRIVATE_REGEX:-}" ]; then
  if xargs -a "$tracked_files" rg -n -i --hidden --glob '!package-lock.json' "$AUDIT_PRIVATE_REGEX"; then
    echo "[audit-public] private denylist match found" >&2
    fail=1
  fi
fi

email_regex='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
if xargs -a "$tracked_files" rg -n --hidden --glob '!package-lock.json' "$email_regex" | rg -v 'admin@example\.com|example\.com'; then
  echo "[audit-public] non-placeholder email found" >&2
  fail=1
fi

secret_regex='(sk-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|tr_(prod|dev)_[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'
if xargs -a "$tracked_files" rg -n --hidden --glob '!package-lock.json' "$secret_regex"; then
  echo "[audit-public] secret-shaped token found" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[audit-public] failed" >&2
  exit 1
fi

echo "[audit-public] ok"
