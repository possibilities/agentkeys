# agentkeys

Inventory keyboard shortcuts across Karabiner, skhd, and Neovim.

## Install

Requires Bun 1.3.14.

```bash
bun install
./scripts/install.sh --install
```

The installer manages only `$HOME/.local/bin/agentkeys` unless `AGENTKEYS_INSTALL_BIN_DIR` is set.

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
