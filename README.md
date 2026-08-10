# agentkeys

[![CI](https://github.com/possibilities/agentkeys/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/possibilities/agentkeys/actions/workflows/ci.yml)

Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, Orca, tmux, herdr, and Neovim; detect cross-layer shadows and find free key slots.

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
envelope, so stdout is parseable whenever a command actually ran. The `keys`
skill in `skills/` teaches an agent to drive all of it.

## Where configuration comes from

Each layer is read from the location its own tool documents, so a plain machine and a dotfiles checkout stowed into place are the same paths.

| Layer | Source |
|---|---|
| karabiner | `~/.config/karabiner/karabiner.json` |
| skhd | `~/.config/skhd/skhdrc` |
| ghostty | `ghostty +list-keybinds`, falling back to `~/.config/ghostty/config` |
| orca | vendored defaults overlaid by `~/.orca/keybindings.json`, when the app is installed |
| tmux | `~/.config/tmux/tmux.conf`, its literal `source-file` targets, and `~/.config/tmux/conf.d/*.conf` |
| herdr | vendored defaults overlaid by `~/.config/herdr/config.toml` (`XDG_CONFIG_HOME` honored), when the app is installed |
| nvim | `~/.config/nvim/init.lua` and `~/.config/nvim/lua/plugins/*.lua` |

Ghostty prefers the binary because the config file holds only what you overrode — the app ships around ninety-five more. Orca and herdr have no dump command at all, so their defaults are vendored from the upstream sources, version-stamped, and joined only when the app is present. Override any path with `AGENTKEYS_KARABINER_CONFIG`, `AGENTKEYS_SKHD_CONFIG`, `AGENTKEYS_GHOSTTY_CONFIG`, `AGENTKEYS_GHOSTTY_BIN` (empty disables the probe), `AGENTKEYS_ORCA_CONFIG`, `AGENTKEYS_ORCA_BIN`, `AGENTKEYS_HERDR_CONFIG`, `AGENTKEYS_HERDR_BIN` (empty treats the app as absent), `AGENTKEYS_TMUX_CONFIG`, or `AGENTKEYS_NVIM_CONFIG`.

Priority follows the hosting paths on a machine where tmux and herdr run inside Ghostty and Neovim runs inside any of the four apps: Ghostty and Orca never see the same keystroke, and neither do tmux and herdr, so same keys across those siblings are never conflicts.

`agentkeys doctor` names every file it read, so a layer whose config is missing never reads as a layer with nothing to report.

## Develop

```bash
bun install
bun run check          # lint + typecheck + test
bash scripts/smoke.sh  # every command end to end, throwaway HOME
```

`CONTEXT.md` holds the domain glossary; `docs/adr/` the decisions that shaped
the design.
