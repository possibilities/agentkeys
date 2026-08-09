# agentkeys — repository guidance

Reads five keyboard config formats, normalizes every binding to one canonical
key string, and reports which layer wins each key. Read `README.md` for usage,
`CONTEXT.md` for the glossary — use its canonical terms in code, comments, and
commit messages.

## Commands

`package.json` has the scripts; `bun run check` is the gate for every commit.
The other check that matters is running the binary against this machine —
`bun src/cli.ts doctor` — because the parsers are only as good as the real
configs they meet, and the test fixtures are written from what those configs
actually contain.

## Map

`src/` is flat, one module per concern:

- `model.ts` owns `LAYERS`, and its order *is* the priority chain. Everything
  downstream derives from it, including the descriptor's `--layer` choices.
- `parsers.ts` is one function per format plus discovery. `collectAll` returns
  bindings *and* a source manifest; nothing may report an empty inventory
  without saying which files it failed to find.
- `normalize.ts` is the whole reason cross-layer comparison works. Every
  parser converts into the canonical key here and nowhere else.
- `reserved.ts` is authored data, not parsed: shortcuts owned by software with
  no readable config. Advisory only — a Reservation is never a Shadow.
- `descriptor.ts` is the single source for commands and flags; help, help-json,
  and validation all fall out of it.

## Load-bearing decisions

The decisions that shaped the design live in `docs/adr/`, one per file:
interception order as the priority chain, the Ghostty binary over its config
file, documented `~/.config` discovery, layer-scoped keys excluded from
conflicts, and passthrough bindings shadowing nothing. Read them before
changing a parser or the conflict logic; append a new numbered record rather
than editing an old one.

## The skill

`skills/keys/SKILL.md` is the canonical runbook and the surface most agent
sessions see: Funk's skills scanner installs it globally with `npx skills add`
against this checkout, discovering it by the nested `skills/<name>/SKILL.md`
layout. `--agent-help` is the in-binary fallback and points at the same
workflow.

The skill is not only a CLI reference — it carries the shortcut *design*
doctrine, and that half is the point. Changing the command surface means
re-verifying the skill's claims against the live CLI before editing its prose.

## Conventions

- Comments state constraints the code can't show; no narration.
- A parser meeting a line it does not understand either skips it silently
  (tmux, whose configs are mostly not bindings) or fails loudly with
  `file:line` (skhd, Neovim, Karabiner, whose binding syntax is unambiguous).
  Pick per format and be consistent within it.
- Exit codes: 0 success, 2 usage fault, 1 anything else. Errors never print a
  stack trace.
- Machine formats (list-bindings json/yaml, explain json) emit one
  `{schema_version, ok, error, data}` envelope per outcome, success or
  failure; usage faults exit before the command runs and are never envelopes.
