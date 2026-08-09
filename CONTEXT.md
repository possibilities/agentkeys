# Glossary

- **Binding** — One normalized keyboard shortcut with its layer, key, action, optional mode, optional context, and optional source location. Avoid: hotkey record.
- **Layer** — A source and interception level for bindings. Priority order is the order a keystroke reaches them: Karabiner, skhd, Ghostty, tmux, Neovim. Avoid: source when priority is relevant.
- **Shadow** — A higher-priority layer uses the same non-scoped key as a lower-priority layer, so the lower binding may not receive it. Avoid: conflict when interception is known.
- **Conditional shadow** — A Shadow whose higher-priority Binding intercepts only in named contexts, such as particular apps or devices. Avoid: Shadow when the condition matters.
- **Layer-scoped key** — A key only that layer's own users can reach: behind a prefix (`prefix+`, `space+`, `leader+`), inside one of its modes, or later in one of its chord sequences. Layer-scoped keys are excluded from cross-layer conflict detection. Avoid: global shortcut.
- **Root-table binding** — A tmux binding declared with `-n` or `-T root`, reachable without the prefix, and therefore the only kind of tmux binding that competes with other layers. Avoid: global binding.
- **Passthrough** — A Binding that forwards the keystroke onward instead of consuming it — skhd's `* ~`, Ghostty's `text:` and `esc:` actions — so it shadows nothing below it. Avoid: no-op.
- **Canonical key** — A lowercase key string with modifiers ordered as `ctrl`, `alt`, `cmd`, `shift`, followed by the base key. Avoid: raw key notation.
- **Reservation** — A well-known shortcut owned by software that keeps no config agentkeys can read: macOS, browsers, readline. Reported as advice against binding over it, never as a Shadow. Avoid: conflict.
