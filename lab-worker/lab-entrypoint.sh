#!/usr/bin/env bash
set -euo pipefail

MOCK_API_PORT="${MOCK_API_PORT:-6443}"
LAB_ID="${LAB_ID:-}"
SESSION_ID="${SESSION_ID:-}"
USER_ID="${USER_ID:-}"
COMPLETION_WEBHOOK_SECRET="${COMPLETION_WEBHOOK_SECRET:-}"

# Derive SCENARIO_PATH from LAB_ID if not set explicitly.
# e.g. LAB_ID=lab-01-broken-pod → /scenarios/lab-01-broken-pod.yaml
if [ -z "${SCENARIO_PATH:-}" ] && [ -n "${LAB_ID}" ]; then
  SCENARIO_PATH="/scenarios/${LAB_ID}.yaml"
fi
SCENARIO_PATH="${SCENARIO_PATH:-}"

# ─── mock-apiserver ───────────────────────────────────────────────────────────

if [ -n "${SCENARIO_PATH}" ] && [ -f "${SCENARIO_PATH}" ]; then
  echo "[lab] starting gymctl serve on port ${MOCK_API_PORT} (scenario: ${SCENARIO_PATH})"
  gymctl serve --scenario "${SCENARIO_PATH}" --port "${MOCK_API_PORT}" &
  MOCK_PID=$!

  # Write a synthetic kubeconfig pointing at the mock server
  mkdir -p /home/labuser/.kube
  cat > /home/labuser/.kube/config <<EOF
apiVersion: v1
kind: Config
clusters:
- name: lab
  cluster:
    server: http://localhost:${MOCK_API_PORT}
contexts:
- name: lab
  context:
    cluster: lab
    user: ""
current-context: lab
users: []
preferences: {}
EOF
  chown -R labuser:labuser /home/labuser/.kube
  echo "[lab] kubeconfig written → http://localhost:${MOCK_API_PORT}"
else
  echo "[lab] SCENARIO_PATH not set or file not found — mock-apiserver not started"
  echo "[lab] kubectl will not be configured"
fi

# ─── Protected completion secret ─────────────────────────────────────────────
# Write the webhook secret to a file readable only by the labops group.
# gymctl runs setgid labops (set in Dockerfile) so it can read this file.
# labuser is NOT in labops, so `cat`, `env`, etc. cannot reveal the secret.

mkdir -p /run/lab
printf '%s' "${COMPLETION_WEBHOOK_SECRET}" > /run/lab/completion_secret
chown root:labops /run/lab/completion_secret
chmod 040 /run/lab/completion_secret  # --- r-- (group-only read)

# ─── labuser .bashrc ──────────────────────────────────────────────────────────
# Export session identifiers (not the secret — that stays in the protected file).

{
  echo ""
  echo "# shart.cloud lab session env vars (injected by container entrypoint)"
  printf 'export LAB_ID=%q\n' "${LAB_ID}"
  printf 'export SESSION_ID=%q\n' "${SESSION_ID}"
  printf 'export USER_ID=%q\n' "${USER_ID}"
  printf 'export SCENARIO_PATH=%q\n' "${SCENARIO_PATH}"
  echo ""
  echo "# Show lab prompts on login"
  echo "gymctl lab prompt 2>/dev/null || true"
} >> /home/labuser/.bashrc

chown labuser:labuser /home/labuser/.bashrc

# ─── ttyd ─────────────────────────────────────────────────────────────────────

echo "[lab] starting ttyd on port 7681"
exec ttyd \
  --port 7681 \
  --writable \
  --once \
  su - labuser
