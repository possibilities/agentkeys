# 0002 — Ghostty is read from the binary, not the config file

`ghostty +list-keybinds` reports the roughly ninety-five default bindings the
config file omits, and those defaults are what actually shadow tmux and
Neovim. The file holds only what the user overrode, so it is the fallback,
and `doctor` names which source was used.
