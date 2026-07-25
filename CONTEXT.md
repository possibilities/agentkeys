# Glossary

- **Binding** — One normalized keyboard shortcut with its layer, key, action, optional mode, optional context, and optional source location. Avoid: hotkey record.
- **Layer** — A source and interception level for bindings. Priority order is Karabiner, then skhd, then Neovim. Avoid: source when priority is relevant.
- **Shadow** — A higher-priority layer uses the same non-scoped key as a lower-priority layer, so the lower binding may not receive it. Avoid: conflict when interception is known.
- **Conditional shadow** — A Shadow whose higher-priority Binding intercepts only in named contexts, such as particular apps or devices. Avoid: Shadow when the condition matters.
- **Layer-scoped key** — A key beginning with `prefix+`, `space+`, or `leader+`; these are local to their Layer for cross-layer conflict detection. Avoid: global shortcut.
- **Canonical key** — A lowercase key string with modifiers ordered as `ctrl`, `alt`, `cmd`, `shift`, followed by the base key. Avoid: raw key notation.
