# Coverage and interception

AgentKeys follows hosting paths, not a flat preference order:

```text
karabiner → skhd → ghostty ┬→ tmux ─→ nvim
                          ├→ herdr ─→ nvim
                          └─────────→ nvim
```

Karabiner sees keys before macOS; skhd handles global hotkeys. Ghostty sees
terminal-focused input. Tmux and Herdr are siblings: only the active
multiplexer receives a key, so a binding in one does not shadow the other.
Neovim can run directly in Ghostty or under either multiplexer.

A higher owner on the same path shadows a lower binding. A conditional owner
only intercepts in its named contexts. Layer-local prefix, leader, mode, and
chord-sequence keys do not collide across layers, but can still collide with
another action inside their own app or focused control.

## Sources

Use the live `doctor` result to see which files or binaries were read.
Documented discovery normally covers Karabiner and skhd configuration, Ghostty,
tmux configuration plus literal source-file targets and conf.d files, Herdr
configuration, and Neovim's init and plugin files.

Ghostty's live keybinding dump includes built-in defaults absent from its
configuration file. Herdr's live default dump is overlaid with user bindings.
When the binary cannot provide that dump, the source row identifies the
versioned vendored fallback; do not present it as proof of the running build.

Host path overrides are server configuration, not inferred from the agent's
working directory. Read the guide for supported overrides if configuring a
separate test server. Do not change the shared server to audit an unrelated
fixture.

## Missing and degraded layers

A missing config can contribute no bindings. A malformed config costs its own
layer while the others remain usable. The command can succeed in this partial
state: `explain` with JSON format reports `data.degraded`, and its human verdict
qualifies the apparent freedom. A layer that was not read cannot be declared
collision-free.

## Blind spots

- Tmux plugins can bind at runtime. Inspect the relevant live server's key table
  when a plugin may own the chord; configuration parsing alone cannot prove it.
- App-internal shortcuts are not collected. Inspect the focused component or
  app's documented behavior; common reservations are only a starting point.
- User changes in macOS System Settings are not readable by AgentKeys.
- Karabiner conditions are summarized, not evaluated against current focus or
  connected devices. A contextual win is not proof that it fires right now.
- An old Herdr binary's fallback defaults may differ from the running build.

Use posture and reach before mnemonics. For a left hand near Command, candidates
near the left letter cluster are generally easier than keys at the far right;
verify the whole modifier/key combination against the person's actual posture.
A mnemonic never compensates for a grip change on a repeated action.
