# agentkeys

Inventory keyboard shortcuts across Karabiner, skhd, and Neovim; detect cross-layer shadows and find free key slots.

## Install

Requires Bun 1.3.14.

```bash
./scripts/install.sh
```

Links `$HOME/.local/bin/agentkeys` to this checkout. Set `AGENTKEYS_INSTALL_BIN_DIR` and `AGENTKEYS_INSTALL_STATE_DIR` to override the install locations.

## Use

```bash
agentkeys doctor
agentkeys find-available --modifier cmd+shift --layer skhd
agentkeys list-bindings --format table
```

`agentkeys --help` lists commands, `agentkeys --agent-help` prints the agent runbook, and `agentkeys <command> --help-json` is machine-readable. Configuration is read from `~/code/dotfiles`.

## Develop

```bash
bun install
bun run check
```
