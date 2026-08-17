#!/usr/bin/env bash
set -euo pipefail

# End-to-end smoke test: exercises every documented agentkeys command against
# a throwaway HOME holding synthetic configs for all six layers.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
MAIN="$ROOT/src/cli.ts"

KEEP=0
for arg in "$@"; do
  case "$arg" in
    --keep)
      KEEP=1
      ;;
    *)
      echo "Unknown smoke.sh option: $arg" >&2
      exit 2
      ;;
  esac
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/agentkeys-smoke.XXXXXX")"
export HOME="$TMP/home"
# An empty binary path keeps the Ghostty probe on the fixture config file.
export AGENTKEYS_GHOSTTY_BIN=""
# The unit suite covers Herdr's live dump; smoke uses the labeled fallback so
# it never reaches an installed binary outside the throwaway HOME.
export AGENTKEYS_HERDR_BIN=""
mkdir -p "$HOME"

ERR_TMP="$TMP/last-stderr"
: >"$ERR_TMP"

STEP="<init>"

cleanup() {
  local status=$?
  if (( KEEP )); then
    echo "Kept smoke workspace at: $TMP"
  else
    rm -rf -- "$TMP"
  fi
  exit "$status"
}
trap cleanup EXIT

on_error() {
  echo "SMOKE FAILED (unexpected error) at step: $STEP (line $1)" >&2
  exit 1
}
trap 'on_error $LINENO' ERR

step() {
  STEP="$1"
  echo
  echo "== $STEP =="
}

fail() {
  echo "SMOKE FAILED at step: $STEP" >&2
  echo "$1" >&2
  exit 1
}

have_jq() {
  command -v jq >/dev/null 2>&1
}

# Runs the CLI, capturing stdout/stderr/status into LAST_STDOUT, LAST_STDERR,
# LAST_STATUS without tripping errexit, echoing the command and its output.
run() {
  echo
  echo "\$ agentkeys $*"
  set +e
  LAST_STDOUT="$(bun "$MAIN" "$@" 2>"$ERR_TMP")"
  LAST_STATUS=$?
  set -e
  LAST_STDERR="$(cat "$ERR_TMP")"
  if [[ -n "$LAST_STDOUT" ]]; then printf '%s\n' "$LAST_STDOUT" | sed 's/^/  /'; fi
  if [[ -n "$LAST_STDERR" ]]; then printf '%s\n' "$LAST_STDERR" | sed 's/^/  ! /'; fi
}

expect_status() {
  [[ "$LAST_STATUS" == "$1" ]] || fail "expected exit $1, got $LAST_STATUS"
}

expect_out() {
  printf '%s' "$LAST_STDOUT" | grep -qF -- "$1" || fail "stdout missing: $1"
}

expect_err() {
  printf '%s' "$LAST_STDERR" | grep -qF -- "$1" || fail "stderr missing: $1"
}

expect_envelope_ok() {
  if have_jq; then
    printf '%s' "$LAST_STDOUT" | jq -e '.schema_version == 1 and .ok == true and .error == null' \
      >/dev/null || fail "stdout is not an ok envelope"
  else
    expect_out '"schema_version": 1'
    expect_out '"ok": true'
  fi
}

step "write fixture configs for all six layers"

mkdir -p "$HOME/.config/karabiner" "$HOME/.config/skhd" "$HOME/.config/ghostty" \
  "$HOME/.config/tmux/conf.d" "$HOME/.config/herdr" "$HOME/.config/nvim/lua/plugins"

cat >"$HOME/.config/karabiner/karabiner.json" <<'JSON'
{
  "profiles": [
    {
      "complex_modifications": {
        "rules": [
          {
            "description": "Focus west",
            "manipulators": [
              {
                "from": { "key_code": "h", "modifiers": { "mandatory": ["left_command", "shift"] } },
                "to": [{ "shell_command": "yabai -m window --focus west" }]
              },
              {
                "from": { "key_code": "j", "modifiers": { "mandatory": ["command"] } },
                "conditions": [
                  {
                    "type": "frontmost_application_if",
                    "bundle_identifiers": ["^com.apple.Terminal$"]
                  }
                ],
                "to": [{ "key_code": "down_arrow" }]
              }
            ]
          }
        ]
      }
    }
  ]
}
JSON

cat >"$HOME/.config/skhd/skhdrc" <<'SKHD'
# focus follows the karabiner binding on purpose: the smoke wants a shadow
cmd + shift - h : yabai -m window --focus west
alt - x : echo one \
  && echo two
cmd - j [
  "Terminal" : echo terminal
  * ~
]
SKHD

cat >"$HOME/.config/ghostty/config" <<'GHOSTTY'
keybind = super+shift+t=new_tab
keybind = super+k=text:clear
keybind = ctrl+a>c=new_window
GHOSTTY

cat >"$HOME/.config/tmux/tmux.conf" <<'TMUX'
set -g prefix C-a
bind -n M-S-H resize-pane -L 5
bind c new-window
source-file ~/.config/tmux/extra.conf
TMUX
cat >"$HOME/.config/tmux/extra.conf" <<'TMUX'
bind -n M-j select-pane -D
TMUX
cat >"$HOME/.config/tmux/conf.d/local.conf" <<'TMUX'
bind r source-file ~/.config/tmux/tmux.conf
TMUX

cat >"$HOME/.config/herdr/config.toml" <<'HERDR'
[keys]
next_tab = ["prefix+n", "alt+2"]
HERDR

cat >"$HOME/.config/nvim/init.lua" <<'LUA'
vim.keymap.set('n', '<Leader>h', ':help<CR>', { desc = 'Help' })
vim.keymap.set('n', '<D-S-h>', ':focuswest<CR>', { desc = 'Focus west' })
LUA
cat >"$HOME/.config/nvim/lua/plugins/telescope.lua" <<'LUA'
vim.keymap.set('n', '<C-p>', ':Telescope find_files<CR>', { desc = 'Find files' })
LUA

step "help surfaces"
run --help
expect_status 0
expect_out "Usage:"
expect_out "list-bindings"
expect_out "find-available"

run --agent-teaser
expect_status 0
expect_out "Inventory keyboard shortcuts"

run --agent-help
expect_status 0
expect_out "Layer priority"
expect_out "schema_version"

for command in list-bindings show-cheatsheet doctor find-available explain; do
  run "$command" --help
  expect_status 0
  expect_out "agentkeys $command"

  run "$command" --help-json
  expect_status 0
  expect_out "\"name\": \"$command\""
done

step "doctor names every source and finds the planted shadow"
run doctor
expect_status 0
expect_out "## Sources"
for layer in karabiner skhd ghostty tmux herdr nvim; do
  expect_out "| $layer |"
done
expect_out "## Shadows"
expect_out "cmd+shift+h"

step "explain ranks the contested chord"
run explain --key cmd+shift+h
expect_status 0
expect_out "Verdict: taken by karabiner."
expect_out "shadowed"

run explain --key cmd+shift+h --format json
expect_status 0
expect_envelope_ok
expect_out '"key": "cmd+shift+h"'

step "find-available proposes priority-safe slots"
run find-available --modifier cmd+shift --layer skhd
expect_status 0
expect_out "Available slots for cmd+shift+* at skhd layer"
expect_out "well known elsewhere"

step "list-bindings renders every format and filter"
run list-bindings
expect_status 0
expect_envelope_ok
expect_out '"layer": "skhd"'

run list-bindings --layer tmux --format yaml
expect_status 0
expect_out "schema_version: 1"
expect_out "layer: tmux"

run list-bindings --modifier cmd+shift --format table
expect_status 0
expect_out "LAYER"
expect_out "cmd+shift+h"

step "show-cheatsheet groups by layer priority"
run show-cheatsheet
expect_status 0
expect_out "## karabiner"
expect_out "## nvim"
expect_out "(shadowed)"

step "usage faults exit 2 and are never envelopes"
run wat
expect_status 2
expect_err "Unknown command: wat"

run explain
expect_status 2
expect_err "Missing required option: --key"

run list-bindings --format xml
expect_status 2
expect_err "Invalid value for --format"

step "a malformed readable config fails loudly"
printf '{' >"$HOME/.config/karabiner/karabiner.json"

run list-bindings
expect_status 1
expect_out '"ok": false'
expect_out "malformed_config"
expect_out "Malformed Karabiner JSON"

run doctor
expect_status 1
expect_err "Malformed Karabiner JSON"

echo
echo "SMOKE PASSED"
