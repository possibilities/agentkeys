# 0004 — Layer-scoped keys are excluded from cross-layer conflicts

A key behind a layer's own prefix, inside one of its modes, or later in one
of its chord sequences can only be pressed by that layer's users, so it can
never collide with another layer. Each parser declares its own scoping —
tmux prefix and mode tables, Neovim leader keys, Ghostty chord sequences —
because only the parser knows which construct is a mode.
