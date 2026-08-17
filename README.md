# AgentKeys

[![CI](https://github.com/possibilities/agentkeys/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/possibilities/agentkeys/actions/workflows/ci.yml)

See every keyboard shortcut on this machine at once — Karabiner, skhd, Ghostty, tmux, Herdr, and Neovim. Find what shadows what, and find a chord that is still free.

## Install

Requires Bun ≥ 1.3.14.

```bash
./scripts/install.sh
```

Links `$HOME/.local/bin/agentkeys` to this checkout. Set `AGENTKEYS_INSTALL_BIN_DIR` and `AGENTKEYS_INSTALL_STATE_DIR` to override the install locations.

## Use

```bash
agentkeys doctor
agentkeys explain --key cmd+shift+v
agentkeys find-available --modifier cmd+shift --layer skhd
agentkeys find-available --modifier prefix --layer herdr
agentkeys list-bindings --format table
```

## For agents

```bash
agentkeys --agent-teaser              # one line
agentkeys --agent-help                # the runbook
agentkeys list-bindings --help-json   # machine-readable flags, per command
```

Machine formats emit the stable `{schema_version, ok, error, data}` envelope
on stdout: `list-bindings` in json (the default) or yaml, and `explain
--format json`. Exit 0 on success, exit 1 with `ok:false` and a snake_case
`error.code` on a domain failure, exit 2 for a usage fault — which is never an
envelope, so stdout is parseable whenever a command actually ran. A config that
will not parse costs its own layer only: the command still answers and still
exits 0, naming the degraded layers on stderr, in `explain --format json` as
`data.degraded`, and under doctor's "Unreadable layers". The `keys` skill in
`skills/` teaches an agent to drive all of it.

## Where configuration comes from

Each layer is read from the location its own tool documents, so a plain machine and a dotfiles checkout stowed into place are the same paths.

| Layer | Source |
|---|---|
| karabiner | `~/.config/karabiner/karabiner.json` |
| skhd | `~/.config/skhd/skhdrc` |
| ghostty | `ghostty +list-keybinds`, falling back to `~/.config/ghostty/config` |
| tmux | `~/.config/tmux/tmux.conf`, its literal `source-file` targets, and `~/.config/tmux/conf.d/*.conf` |
| herdr | `herdr --default-config` overlaid by `~/.config/herdr/config.toml` (`XDG_CONFIG_HOME` honored), with a labeled vendored fallback |
| nvim | `~/.config/nvim/init.lua` and `~/.config/nvim/lua/plugins/*.lua` |

Ghostty prefers the binary, because its config file holds only what you overrode — the app ships around ninety-five more bindings. Herdr also prefers its installed binary: `--default-config` identifies both current defaults and supported actions even when an untagged build still reports an older version. Older Herdr binaries use a visibly labeled vendored 0.8.0 fallback.

Herdr user Bindings take precedence over defaults on the same Canonical key. The inactive default is a Displacement, not a Binding: `explain` names it, while Shadows and availability consider only the Binding that actually runs.

Every path is overridable: `AGENTKEYS_KARABINER_CONFIG`, `AGENTKEYS_SKHD_CONFIG`, `AGENTKEYS_GHOSTTY_CONFIG`, `AGENTKEYS_GHOSTTY_BIN` (empty disables the probe), `AGENTKEYS_HERDR_CONFIG`, `AGENTKEYS_HERDR_BIN` (empty disables the live probe), `AGENTKEYS_TMUX_CONFIG`, and `AGENTKEYS_NVIM_CONFIG`.

Priority follows the hosting paths: tmux and Herdr run inside Ghostty, and Neovim runs directly in Ghostty or inside either multiplexer. Tmux and Herdr never see the same keystroke, so the same key in those sibling layers is never a conflict.

`agentkeys doctor` names every file it read, so a layer whose config is missing never reads as a layer with nothing to report.

`find-available --modifier` also accepts Layer-scoped prefixes: use `prefix` for tmux and Herdr, and `space` for the Neovim leader table on this machine.

## Develop

```bash
bun install
bun run check          # lint + typecheck + test
bash scripts/smoke.sh  # every command end to end, throwaway HOME
```

`CONTEXT.md` holds the domain glossary; `docs/adr/` the decisions that shaped
the design.
