# agentkeys

Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, tmux, and Neovim; detect cross-layer shadows and find free key slots.

## Install

Requires Bun 1.3.14.

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

`agentkeys --help` lists commands, `agentkeys --agent-help` prints the agent runbook, and `agentkeys <command> --help-json` is machine-readable. The `keys` skill in `skills/` teaches an agent to drive all of it.

## Where configuration comes from

Each layer is read from the location its own tool documents, so a plain machine and a dotfiles checkout stowed into place are the same paths.

| Layer | Source |
|---|---|
| karabiner | `~/.config/karabiner/karabiner.json` |
| skhd | `~/.config/skhd/skhdrc` |
| ghostty | `ghostty +list-keybinds`, falling back to `~/.config/ghostty/config` |
| tmux | `~/.config/tmux/tmux.conf`, its literal `source-file` targets, and `~/.config/tmux/conf.d/*.conf` |
| nvim | `~/.config/nvim/init.lua` and `~/.config/nvim/lua/plugins/*.lua` |

Ghostty prefers the binary because the config file holds only what you overrode — the app ships around ninety-five more. Override any path with `AGENTKEYS_KARABINER_CONFIG`, `AGENTKEYS_SKHD_CONFIG`, `AGENTKEYS_GHOSTTY_CONFIG`, `AGENTKEYS_GHOSTTY_BIN` (empty disables the probe), `AGENTKEYS_TMUX_CONFIG`, or `AGENTKEYS_NVIM_CONFIG`.

`agentkeys doctor` names every file it read, so a layer whose config is missing never reads as a layer with nothing to report.

## Develop

```bash
bun install
bun run check
```
