# Glossary

- **Binding** — One normalized keyboard shortcut with its layer, key, action, optional mode, optional context, and optional source location. Avoid: hotkey record.
- **Layer** — A source and interception level for bindings. Priority is the order a keystroke reaches them along its Hosting path: Karabiner, skhd, Ghostty, then tmux or herdr when one is active, then Neovim. Avoid: source when priority is relevant.
- **Hosting path** — A chain of layers that hand a keystroke downward on this machine: Karabiner → skhd → Ghostty → Neovim, with tmux or herdr optionally between Ghostty and Neovim. A Shadow exists only between layers on one path. Avoid: chain when siblings are involved.
- **Sibling layers** — Layers on no shared Hosting path: tmux and herdr. Only the active multiplexer receives the keystroke, so identical keys across them are two apps' own shortcuts, never a Shadow. Avoid: conflict.
- **Vendored fallback** — Herdr 0.8.0 defaults transcribed from source and used only when the installed binary cannot provide `--default-config`, visibly labeled in the source manifest. Avoid: source of record.
- **Displacement** — A same-Layer precedence outcome where a user Binding suppresses a default on the same Canonical key. Recorded for `explain`, but never added to the Binding inventory or treated as a Shadow. Avoid: disabled Binding, Shadow.
- **Shadow** — A higher-priority layer uses the same non-scoped key as a lower-priority layer, so the lower binding may not receive it. Avoid: conflict when interception is known.
- **Conditional shadow** — A Shadow whose higher-priority Binding intercepts only in named contexts, such as particular apps or devices. Avoid: Shadow when the condition matters.
- **Layer-scoped key** — A key only that layer's own users can reach: behind a prefix (`prefix+`, `space+`, `leader+`), inside one of its modes, or later in one of its chord sequences. Layer-scoped keys are excluded from cross-layer conflict detection. Avoid: global shortcut.
- **Root-table binding** — A tmux binding declared with `-n` or `-T root`, reachable without the prefix, and therefore the only kind of tmux binding that competes with other layers. Avoid: global binding.
- **Passthrough** — A Binding that forwards the keystroke onward instead of consuming it — skhd's `* ~`, Ghostty's `text:` and `esc:` actions — so it shadows nothing below it. Avoid: no-op.
- **Canonical key** — A lowercase key string with modifiers ordered as `ctrl`, `alt`, `cmd`, `shift`, followed by the base key. Avoid: raw key notation.
- **Reservation** — A well-known shortcut owned by software that keeps no config agentkeys can read: macOS, browsers, readline. Reported as advice against binding over it, never as a Shadow. Avoid: conflict.
- **Degraded layer** — A Layer whose config was found but would not parse. It contributes no Bindings, is named in every report built from that inventory, and never lowers the run's exit code. Avoid: missing layer, empty layer.
- **Envelope** — The `{schema_version, ok, error, data}` wrapper every machine-format outcome is emitted in, success or failure, shared across the agent* family. Usage faults exit before a command runs and are not Envelopes. Avoid: payload.
