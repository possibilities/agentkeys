# Glossary

- **Binding** — One normalized keyboard shortcut with its layer, key, action, optional mode, optional context, and optional source location. Avoid: hotkey record.
- **Layer** — A source and interception level for bindings. Priority is the order a keystroke reaches them along its Hosting path: Karabiner, skhd, then the focused app (Ghostty or Orca), then what it hosts (tmux or herdr inside Ghostty), then Neovim inside any of them. Avoid: source when priority is relevant.
- **Hosting path** — The chain of layers that hand a keystroke downward on this machine: Karabiner → skhd → Ghostty → tmux/herdr → Neovim, or Karabiner → skhd → Orca → Neovim. A Shadow exists only between layers on one path. Avoid: chain when siblings are involved.
- **Sibling layers** — Layers on no shared Hosting path: Ghostty and Orca, tmux and herdr. Only the focused one ever holds the keystroke, so identical keys across siblings are two apps' own shortcuts, never a Shadow. Avoid: conflict.
- **Vendored default** — A Binding transcribed by hand from an app's source because the app has no dump command (Orca, herdr), version-stamped, and joined to the inventory only when the app is present. Avoid: parsed binding.
- **Shadow** — A higher-priority layer uses the same non-scoped key as a lower-priority layer, so the lower binding may not receive it. Avoid: conflict when interception is known.
- **Conditional shadow** — A Shadow whose higher-priority Binding intercepts only in named contexts, such as particular apps or devices. Avoid: Shadow when the condition matters.
- **Layer-scoped key** — A key only that layer's own users can reach: behind a prefix (`prefix+`, `space+`, `leader+`), inside one of its modes, or later in one of its chord sequences. Layer-scoped keys are excluded from cross-layer conflict detection. Avoid: global shortcut.
- **Root-table binding** — A tmux binding declared with `-n` or `-T root`, reachable without the prefix, and therefore the only kind of tmux binding that competes with other layers. Avoid: global binding.
- **Passthrough** — A Binding that forwards the keystroke onward instead of consuming it — skhd's `* ~`, Ghostty's `text:` and `esc:` actions — so it shadows nothing below it. Avoid: no-op.
- **Canonical key** — A lowercase key string with modifiers ordered as `ctrl`, `alt`, `cmd`, `shift`, followed by the base key. Avoid: raw key notation.
- **Reservation** — A well-known shortcut owned by software that keeps no config agentkeys can read: macOS, browsers, readline. Reported as advice against binding over it, never as a Shadow. Avoid: conflict.
- **Envelope** — The `{schema_version, ok, error, data}` wrapper every machine-format outcome is emitted in, success or failure, shared across the agent* family. Usage faults exit before a command runs and are not Envelopes. Avoid: payload.
