# agentkeys

Inventory keyboard shortcuts across Karabiner, skhd, and Neovim.

## Install

Requires Bun 1.3.14.

```bash
./scripts/install.sh
```

The installer performs a frozen dependency install, links `$HOME/.local/bin/agentkeys` to this checkout, and records the deployed Git SHA in `$HOME/.local/state/agentkeys/deployed-sha`. Set `AGENTKEYS_INSTALL_BIN_DIR` and `AGENTKEYS_INSTALL_STATE_DIR` to override those locations.

## Commands

```bash
agentkeys list-bindings --format json
agentkeys list-bindings --layer skhd --modifier cmd+shift --format table
agentkeys show-cheatsheet
agentkeys doctor
agentkeys find-available --modifier shift+cmd --layer skhd
```

Default live configuration paths are under `~/code/dotfiles` for Karabiner, skhd, and Neovim. Missing files produce zero bindings. Readable malformed configuration files fail with a clear error.

Use `agentkeys --help`, `agentkeys <command> --help`, or `agentkeys <command> --help-json` for command discovery.
