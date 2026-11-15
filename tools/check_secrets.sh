#!/usr/bin/env bash
# Tattoo House: secret / personal-data check before push.
#
#   bash tools/check_secrets.sh          check the index (what the next commit contains)
#   bash tools/check_secrets.sh HEAD     check the committed tree (used by the pre-push hook)
#
# Fails (exit 1) if the checked tree contains:
#   - .env files (except .env.example), config.js, the admin reference folder
#   - Supabase keys / JWTs / service_role mentions with a value
#   - any non-empty value from the local .env (URL, keys, test e-mail, test password)
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

REF="${1:-}"
fail=0
say() { printf '  %s\n' "$*"; fail=1; }

if [ -n "$REF" ]; then
  files=$(git ls-tree -r --name-only "$REF")
  grep_tree() { git grep -I -n -E "$1" "$REF" -- . ':(exclude)tools/check_secrets.sh' 2>/dev/null; }
  grep_fixed() { git grep -I -n -F -e "$1" "$REF" -- . ':(exclude)tools/check_secrets.sh' 2>/dev/null; }
else
  files=$(git ls-files --cached)
  grep_tree() { git grep -I -n --cached -E "$1" -- . ':(exclude)tools/check_secrets.sh' 2>/dev/null; }
  grep_fixed() { git grep -I -n --cached -F -e "$1" -- . ':(exclude)tools/check_secrets.sh' 2>/dev/null; }
fi

echo "Secret check (${REF:-index})"

# 1. forbidden files
bad_files=$(printf '%s\n' "$files" | grep -E '(^|/)\.env(\..+)?$|(^|/)config\.js$|^admin-panel' | grep -v -E '(^|/)\.env\.example$')
[ -n "$bad_files" ] && say "forbidden files: $bad_files"

# 2. key-like patterns
hits=$(grep_tree 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_(publishable|secret)_[A-Za-z0-9_-]{10,}|service_role["'"'"' :=]+[A-Za-z0-9]')
[ -n "$hits" ] && say "key-like strings:" && printf '%s\n' "$hits" | sed 's/^/    /'

# 3. values from local .env
if [ -f .env ]; then
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue ;; esac
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
    [ ${#v} -lt 6 ] && continue
    if [ -n "$(grep_fixed "$v")" ]; then say "value of $k from .env found in tree"; fi
  done < .env
fi

if [ "$fail" -ne 0 ]; then
  echo "FAILED: remove the items above before pushing."
  exit 1
fi
echo "OK: no secrets found."
