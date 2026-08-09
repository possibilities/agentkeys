# 0006 — Interception follows hosting paths, not one flat chain

Adding orca (a GUI terminal app beside Ghostty) and herdr (a multiplexer
beside tmux) broke the premise of 0001 that every pair of layers shares one
keystroke path. Ghostty and orca never see the same keystroke — only the
focused app gets it — and on this machine tmux and herdr run beside each
other inside Ghostty, never nested. A flat chain would have reported their
overlapping defaults as ~90 false shadows.

`LAYERS` stays a single topological order for display and stable output, but
every priority question now goes through `intercepts(higher, lower)`: true
only when `higher` sits on a hosting path above `lower`. Sibling layers
(ghostty|orca, tmux|herdr) shadow nothing in each other, and orca shadows
only what it hosts — Neovim — never tmux or herdr. Neovim keeps every other
layer as a potential interceptor because it runs inside any of them.

The paths encode this machine's actual usage, not every conceivable nesting;
running herdr inside tmux would change the map, and the map is where that
change belongs.
