---
name: keys
description: Choose and audit keyboard shortcuts with the agentkeys CLI — the full interception chain across Karabiner, skhd, Ghostty, tmux, herdr, and Neovim, plus the shortcuts common apps already own. Use when someone asks what to bind a command to, whether a chord is free, why a shortcut stopped working or fires the wrong thing, which key a layer is stealing, or wants a map of what is currently bound. Also use before adding any keybinding to a config file — a mnemonic-first guess is how conflicts get made.
---

# Keys — choose a shortcut that fits the action

Use AgentKeys through Executor: discover `agentkeys`, describe the selected
tool, and read `guide` when its model or coverage is unfamiliar. Executor
normalizes hyphenated tool names, such as `find_available` and `list_bindings`;
use the discovered path and property names.

The tools report bindings and interception. The design work is deciding which
reachable, context-appropriate chord to choose. A free chord alone is not a
recommendation.

## Start with the user's posture

Infer the posture from the actual workflow; ask briefly when it is unclear.
The shortcut should meet the hand where it already is.

| Posture | Design consequence |
| --- | --- |
| Both hands typing | Two-handed chords are practical; mnemonic choices have room to win. |
| One hand on a pointer | The keyboard hand must reach the whole chord without a grip change. |
| Hands away from the keyboard | Avoid accidental activation; a more deliberate global chord may fit. |
| Inside a modal app | Prefer that app's prefix, leader, or mode table when appropriate. |

Choose by posture, reach, focus behavior, and conflicts; use a mnemonic to
break ties. Frequent actions deserve easy reach. Repeated actions should keep
one stable grip and vary the last key. Related actions should form a consistent
family, with opposites on naturally paired keys.

Before choosing an app-internal shortcut, inspect what can have focus. Preserve
expected text editing, list navigation, Return/Escape, and embedded browser
behavior. Scope the action away from a control that already needs the key. If
an override is intended, explain what changes and keep an accessible alternative.

## Verify coverage and candidates

1. Use `doctor` to inspect the actual sources and any unreadable or missing
   layers. Empty output from a missing source does not prove a chord is free.
2. Use `explain` with a candidate key and `format: "json"` for its owners,
   context, displacements, and degraded-layer evidence.
3. Use `find_available` for a modifier and target layer when exploring choices.
   Use `list_bindings` or `show_cheatsheet` for an inventory or shareable view.
4. Present a small shortlist with reach, context, and collision tradeoffs. If
   the user already authorized a specific implementation, choose from the
   evidence and proceed instead of adding a routine approval round.

Example input to `explain`:

```json
{"key":"cmd+shift+v","format":"json"}
```

Example input to `find_available`:

```json
{"modifier":"prefix","layer":"herdr"}
```

AgentKeys reads; it does not edit configuration. Make the authorized change in
its owning source repository, install/reload through that project's supported
path, then verify the actual shortcut in the relevant context.

## Interpret the result correctly

Check Executor's outer result and the MCP envelope `{schema_version, ok, error,
data}`. Prefer structured content or the standalone JSON text block. A refused
MCP result may be carried in Executor's `error.details.content`; use its error
code and recovery rather than parsing terminal prose.

A successful call can still have incomplete coverage. Check `data.degraded`
on JSON explanations and the source/degradation information from `doctor`.
Report a qualified verdict when a layer was unavailable.

Bindings can win outright, win only in specified contexts, be shadowed, be
scoped to a layer, or transparently pass the key onward. A Herdr user binding
can displace a same-key default; that inactive default is a displacement, not a
second active binding. Reservations for common software are advisory and need
an actual app/focus check.

Read [coverage and interception](references/coverage.md) before relying on a
cross-layer verdict or diagnosing a missing binding. App shortcuts, runtime
plugins, and current device/application conditions are not a complete part of
the parsed inventory.
