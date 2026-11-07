#!/usr/bin/env bash
# 通しの試験：まっさらなローカルDBでサーバーを起動し、test/e2e.mjs を流す
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8788}
if curl -s -o /dev/null "http://127.0.0.1:$PORT"; then echo "ポート $PORT が使われています。止めてからやり直してください" >&2; exit 1; fi
TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
STATE=$(mktemp -d)
printf 'DEV_AUTH=1\nINTERNAL_TOKEN=%s\n' "$TOKEN" > "$STATE/.dev.vars"
[ -d dist ] || npx vite build >/dev/null
npx wrangler d1 migrations apply firmwatch --local --persist-to "$STATE" >/dev/null
npx wrangler dev --port "$PORT" --ip 127.0.0.1 --persist-to "$STATE" --env-file "$STATE/.dev.vars" > "$STATE/wrangler.log" 2>&1 &
PID=$!
trap 'pkill -P $PID 2>/dev/null; kill $PID 2>/dev/null; pkill -f "port $PORT" 2>/dev/null; cp "$STATE/wrangler.log" /tmp/e2e-wrangler.log 2>/dev/null; rm -rf "$STATE"' EXIT
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/api/push/vapid" >/dev/null && break; sleep 1; done
# 試験を順に流す。失敗したら最後の出力を GitHub の注記（::error::）にも出す（記録を読めない環境でも原因が分かるように）
run() {
  local name="$1"; shift
  local out; out=$(mktemp)
  if ! "$@" > "$out" 2>&1; then
    cat "$out"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      msg=$(tail -n 15 "$out" | sed 's/%/%25/g' | awk 'BEGIN{ORS="%0A"} {print}')
      echo "::error title=${name}::${msg}"
    fi
    return 1
  fi
  cat "$out"
}
run 通しの試験 env INTERNAL_TOKEN="$TOKEN" node test/e2e.mjs "http://127.0.0.1:$PORT"
run パスキーの試験 node test/passkey.mjs "http://localhost:$PORT"
run 通知の試験 node test/push.mjs "http://localhost:$PORT"
run バージョンの切り替えの試験 node test/update.mjs "http://localhost:$PORT"
