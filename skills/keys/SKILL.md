---
name: keys
description: Choose and audit keyboard shortcuts with the agentkeys CLI — the full interception chain across Karabiner, skhd, Ghostty, tmux, herdr, and Neovim, plus the shortcuts common apps already own. Use when someone asks what to bind a command to, whether a chord is free, why a shortcut stopped working or fires the wrong thing, which key a layer is stealing, or wants a map of what is currently bound. Also use before adding any keybinding to a config file — a mnemonic-first guess is how conflicts get made.
---

# Keys — pick a shortcut the hand can actually reach

Two jobs, and the second one is the reason this skill exists.

1. **Report** what is bound, what shadows what, and what is free. `agentkeys`
  does this by reading six layers and normalizing every binding to one key
   string.
2. **Advise** on what to bind. A free key is not automatically a good key. Most
   of the work is choosing among the free ones.

Verified against agentkeys 0.1.0. The CLI is self-describing — when this
document and the installed binary disagree, the binary wins; check
`agentkeys --help` and `agentkeys <command> --help-json`.

## The rule

> Raycast is my favorite example when people ask me about designing keyboard
> shortcuts.
>
> Most of us try to make shortcuts memorable. T is for theme, so I'm going to
> make option+t toggle theme.
>
> That's fine. But you need to consider user's hand placement. Are they using
> your app one-handed, or are both hands already on the keyboard (like right
> after launching Raycast)? Which common actions a user might be need both a
> pointer and a keyboard to do?
>
> Raycast gets this. Really well.
>
> **The shortcut should meet the hand where it already is.**
>
> — shadcn

Mnemonics are how most people pick shortcuts and it is the wrong first
question. `option+t` for theme is memorable and useless if the user's right
hand is on the trackpad every time they want it. Posture first, reach second,
conflicts third, mnemonic last — as a tiebreaker among what survived.

## Ask where the hands are

Before proposing anything, establish the posture the action is invoked from.
This is usually **the one question worth asking the human**, and it is
answerable in a sentence:

> When you reach for this, where are your hands — both on the keyboard, one on
> the mouse, or away from the keyboard entirely?

Four postures, four different right answers:

| Posture | When | What fits |
|---|---|---|
| **Both hands on the keyboard** | Mid-typing; just opened a launcher, palette, or search field | Two-handed chords are fine. Most capacity, so this is where a mnemonic can win. |
| **One hand on the pointer** | The action follows something clicked, selected, dragged, or hovered | Must be hittable by the free hand alone, without looking or shifting grip. On macOS that is nearly always the left hand, thumb on cmd. |
| **Hands away from the keyboard** | Summoning something global — a launcher, a window action, a capture tool | Reach barely matters; being hard to hit *by accident* does. A three-modifier chord is reasonable here and nowhere else. |
| **Home row inside a modal app** | Already in tmux, herdr, Neovim, a TUI | Use that app's prefix or leader table. It exists so the chord does not have to be a stretch, and a layer-scoped key can never collide with another layer. |

The Raycast lesson in concrete terms: right after the launcher opens, both
hands are already on the keyboard and the user is typing, so its action
shortcuts are two-handed and mnemonic. But actions that follow a pointer get a
chord the keyboard-side hand can hit alone. Same app, two different rules,
chosen by posture.

## Then reach

With cmd or ctrl held by the same hand's thumb or pinky, one-handed reach is
roughly:

- **Left hand:** `1 2 3 4 5`, `q w e r t`, `a s d f g`, `z x c v b`
- **Right hand:** `6 7 8 9 0`, `y u i o p`, `h j k l ;`, `n m , . /`

A left-hand chord is the one to reach for when the other hand is on the
pointer. `cmd+shift+p` qualifies; `cmd+shift+/` does not — it needs both hands
or a grip change.

Three more constraints that decide more cases than mnemonics do:

- **Frequency inverts the tradeoff.** A fifty-times-a-day action must be under
  the fingers and can afford to be arbitrary — the hand learns it in a week. A
  weekly action should be memorable, because the hand will not.
- **Repeated actions need a stable grip.** If the action fires several times in
  a row — resize a pane, move a window, cycle a tab — hold one modifier and vary
  only the last key. That is why the tmux resize bindings here are
  `alt+shift+h/j/k/l` and not four unrelated chords.
- **Related actions should differ only in the last key**, and opposites should
  land on keys the hand already pairs: `h`/`l`, `j`/`k`, `[`/`]`, `,`/`.`.

## Then check conflicts

```bash
agentkeys explain --key cmd+shift+v      # who owns this chord, across everything
agentkeys find-available --modifier cmd+shift --layer skhd
```

`explain` is the call to make for a candidate. It ranks every layer that binds
the key and ends with a verdict:

```
Verdict: taken by skhd.
Verdict: taken by skhd, nvim, but only in their listed contexts.
Verdict: free in your config, but macOS uses it.
Verdict: free.
```

Per-binding verdicts: `wins` (claims the key outright), `wins in context`
(claims it only in the named apps or modes, so lower layers still get it
elsewhere), `shadowed`, `scoped` (layer-local, cannot collide), `transparent`
(forwards the key onward).

`find-available` lists free slots for a modifier combo at a target layer,
blocking against every layer at or above it, then names the free ones that are
well known elsewhere. Both are advisory on that last part — see
[Reservations](#reservations).

## Then, and only then, the mnemonic

Among the candidates that survived posture, reach, and conflicts, prefer the
one whose letter means something. If none does, ship the reachable one anyway.
A shortcut the hand finds is better than a shortcut the head can explain.

## Propose two or three, not one

Give the human the shortlist with the reasoning attached, because they know
things the tool does not — which app they will be in, what their other machine
is bound to, what they already have muscle memory for:

> - `cmd+shift+d` — left hand alone, free everywhere, "duplicate"
> - `cmd+shift+e` — same hand, free, no mnemonic
> - `cmd+shift+/` — free, but two-handed; only if you always invoke it mid-typing

## The layer chain

Priority is interception order, not preference. A keystroke reaches each layer
in turn along its hosting path, and whatever a higher layer claims never
arrives below:

```
karabiner → skhd → ghostty ┬→ tmux ─→ nvim
                          ├→ herdr ─→ nvim
                          └─────────→ nvim
```

- **karabiner** — virtual HID driver, sees keys before macOS does
- **skhd** — system hotkey daemon, global
- **ghostty** — the terminal app, while it is focused
- **tmux** — inside Ghostty; only root-table (`bind -n`) bindings compete
- **herdr** — inside Ghostty, beside tmux; only its prefix key and direct
  chords compete
- **nvim** — directly inside Ghostty or inside either multiplexer

A binding lower on the same path is only reachable if nothing above claims the
same key. That is a **shadow**. When the higher binding is limited to named
apps, devices, or modes, it is a **conditional shadow** and the lower binding
still works everywhere else. **Sibling layers** tmux and herdr share no path:
only the active multiplexer receives the keystroke, so the same key in both is
two apps' own shortcut, never a conflict, and `explain` can end in `taken by
tmux, herdr` with both marked `wins`.

Keys that cannot collide across layers at all: Neovim leader and `space+` keys,
tmux and herdr prefix and mode keys, and Ghostty chord sequences. Bind freely
there — it is the cheapest place to put a shortcut, and the reason a modal app
should use its own prefix rather than a global chord.

## Reservations

Software that keeps no readable config still owns shortcuts: macOS itself,
browsers, readline in every shell and REPL. agentkeys ships a curated table and
reports matches as advice, never as conflicts — they lose to Karabiner and skhd
and most apply only while one app is focused. Binding over one is a real
choice, sometimes the right one; making it knowingly is the point.

## The commands

```bash
agentkeys doctor                                        # sources, then shadows
agentkeys explain --key cmd+shift+v [--format json]
agentkeys find-available --modifier cmd+shift --layer skhd
agentkeys list-bindings [--layer L] [--modifier M] [--format json|yaml|table]
agentkeys show-cheatsheet [--layer L]                   # Markdown, by priority
```

Start with `doctor`. Its first section names the file each layer was read from
and how many bindings came out, which is the only way to tell a quiet machine
from a misconfigured one:

```
| Layer | Source | Bindings |
|-------|--------|----------|
| karabiner | /Users/x/.config/karabiner/karabiner.json | 23 |
| tmux | /Users/x/.config/tmux/tmux.conf (+5 more) | 34 |
| ghostty | /Applications/Ghostty.app/Contents/MacOS/ghostty +list-keybinds | 95 |
| herdr | vendored 0.8.0 defaults (/Users/x/.config/herdr/config.toml not found) | 52 |
```

Contract: machine formats emit one stable `{schema_version, ok, error, data}`
envelope on stdout — `list-bindings` in its default json (or yaml), and
`explain --format json` for one key — use those for scripting. A domain
failure there is the same envelope with `ok:false` and a snake_case
`error.code`. Exit 0 success, 2 usage fault (never an envelope), 1 anything
else. A malformed but readable config fails loudly with `file:line`; a missing
config contributes nothing.

## Where configuration is read from

Each layer comes from the location its own tool documents, under `~/.config`:
`karabiner/karabiner.json`, `skhd/skhdrc`, `ghostty/config`, `tmux/tmux.conf`
plus its literal `source-file` targets and `tmux/conf.d/*.conf`,
`herdr/config.toml` (`XDG_CONFIG_HOME` honored), and `nvim/init.lua` plus
`nvim/lua/plugins/*.lua`.

Ghostty is read from `ghostty +list-keybinds` when the binary is installed,
because the config file holds only what the user overrode — the app ships
around ninety-five defaults, and those are the ones that shadow tmux and
Neovim. Herdr has no dump command, so its defaults are vendored from the
upstream source, version-stamped in the doctor source row, and joined only
when the app is present; its config file overlays the defaults (rebinds
replace, explicit unbinds delete). Override any path with
`AGENTKEYS_KARABINER_CONFIG`, `AGENTKEYS_SKHD_CONFIG`,
`AGENTKEYS_GHOSTTY_CONFIG`, `AGENTKEYS_GHOSTTY_BIN` (empty disables the
probe), `AGENTKEYS_HERDR_CONFIG`, `AGENTKEYS_HERDR_BIN` (empty treats the app as
absent), `AGENTKEYS_TMUX_CONFIG`, `AGENTKEYS_NVIM_CONFIG`.

## Blind spots

State these rather than implying coverage the tool does not have:

- **tmux plugins bind at runtime.** A plugin claiming `prefix+F` never appears
  in the config. `tmux list-keys` against a live server is the check.
- **App-internal shortcuts are not read at all** — VS Code, Slack, the editor
  the user actually spends the day in. Reservations cover only the near-universal
  ones.
- **macOS System Settings keyboard shortcuts are not readable**, including
  whatever the user remapped Spotlight to.
- **Karabiner conditions are summarized, not evaluated.** A rule limited to one
  app or the built-in keyboard reports as `wins in context`; whether it fires
  right now depends on state agentkeys cannot see.
- **Herdr defaults are a vendored snapshot.** A newer app build may
  have moved a chord; the doctor source row names the vendored version, so
  compare it against the installed app when something looks off.
- **Nothing here is written.** agentkeys only reads. Editing the config file is
  a separate, explicit step after the human picks.
