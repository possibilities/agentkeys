# 0003 — Discovery uses each tool's documented config location

Every layer is read from the path its own tool documents under `~/.config`,
so a plain machine and a dotfiles checkout stowed into place are the same
paths. An earlier version hardcoded a private dotfiles checkout and silently
returned nothing on every machine but one; a private path must never return
as a default, and every path stays overridable by environment variable.
