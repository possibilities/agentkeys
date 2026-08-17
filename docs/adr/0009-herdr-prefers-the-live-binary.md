# 0009 — Herdr prefers the live binary

Herdr now exposes `--default-config`, so the installed binary replaces the
vendored snapshot as the source of record; older binaries retain a visibly
labeled 0.8.0 fallback. User Bindings take same-Layer precedence over defaults,
and the suppressed defaults become Displacements rather than live Bindings.
