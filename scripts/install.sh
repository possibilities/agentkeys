#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="${AGENTKEYS_INSTALL_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/agentkeys"
MARKER="agentkeys-managed-wrapper"
ROOT_MARKER="agentkeys-source-root: $ROOT"

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh --install|--uninstall|--help

Install writes one managed executable wrapper named agentkeys.
Set AGENTKEYS_INSTALL_BIN_DIR to test or install into another bin directory.
USAGE
}

write_wrapper() {
  local path="$1"
  {
    printf '#!/usr/bin/env bash\n'
    printf '# %s\n' "$MARKER"
    printf '# %s\n' "$ROOT_MARKER"
    printf 'exec bun run %q "$@"\n' "$ROOT/src/cli.ts"
  } >"$path"
}

owner_uid() {
  stat -c %u "$1" 2>/dev/null || stat -f %u "$1"
}

ensure_bin_dir() {
  if [[ -L "$BIN_DIR" ]]; then
    echo "Refusing symlink bin directory: $BIN_DIR" >&2
    exit 1
  fi
  if [[ -e "$BIN_DIR" && ! -d "$BIN_DIR" ]]; then
    echo "Refusing non-directory bin path: $BIN_DIR" >&2
    exit 1
  fi
  mkdir -p "$BIN_DIR"
}

target_is_owned_exact() {
  [[ ! -L "$TARGET" ]] || return 1
  [[ -f "$TARGET" ]] || return 1
  [[ "$(owner_uid "$TARGET")" == "$(id -u)" ]] || return 1

  local expected
  expected="$(mktemp "${TMPDIR:-/tmp}/agentkeys-wrapper.XXXXXX")"
  write_wrapper "$expected"
  if cmp -s "$TARGET" "$expected"; then
    rm -f "$expected"
    return 0
  fi
  rm -f "$expected"
  return 1
}

refuse_foreign_target() {
  if [[ -L "$TARGET" ]]; then
    echo "Refusing to manage foreign symlink: $TARGET" >&2
    exit 1
  fi
  if [[ -e "$TARGET" ]] && ! target_is_owned_exact; then
    echo "Refusing to manage foreign file: $TARGET" >&2
    exit 1
  fi
}

install_agentkeys() {
  command -v bun >/dev/null 2>&1 || {
    echo "Bun is required but was not found in PATH" >&2
    exit 1
  }
  ensure_bin_dir
  refuse_foreign_target
  (cd "$ROOT" && bun install --frozen-lockfile)

  local tmp
  tmp="$(mktemp "$BIN_DIR/.agentkeys.XXXXXX")"
  write_wrapper "$tmp"
  chmod 0755 "$tmp"
  mv "$tmp" "$TARGET"

  if [[ ! -x "$TARGET" ]] || ! target_is_owned_exact; then
    echo "Installed wrapper failed ownership verification: $TARGET" >&2
    exit 1
  fi
  echo "Installed $TARGET"
}

uninstall_agentkeys() {
  ensure_bin_dir
  if [[ ! -e "$TARGET" && ! -L "$TARGET" ]]; then
    echo "Nothing to uninstall at $TARGET"
    return 0
  fi
  refuse_foreign_target
  rm -f "$TARGET"
  echo "Removed $TARGET"
}

if [[ $# -ne 1 ]]; then
  echo "Expected exactly one installer option" >&2
  usage >&2
  exit 2
fi

case "$1" in
  --install)
    install_agentkeys
    ;;
  --uninstall)
    uninstall_agentkeys
    ;;
  --help|-h)
    usage
    ;;
  *)
    echo "Unknown installer option: $1" >&2
    usage >&2
    exit 2
    ;;
esac
