# 0007 — Defaults without a dump command are vendored data

0002 established that defaults are what actually shadow, and that a binary
which can report them beats parsing the user's file. orca and herdr ship no
dump command at all: orca's registry is compiled into the app, herdr's lives
in `KeysConfig::default()`. So their defaults are transcribed by hand into
`vendored.ts` from the upstream sources, version-stamped, and verified
against a checkout before each refresh.

Vendored defaults describe an app, not a machine: they join the inventory
only when the app is present (binary found, or its config file written), or
they would report shadows from software the machine never runs. The config
file stays the overlay — rebinds replace a default, explicit unbinds delete
it — mirroring each app's own merge order.

A stale stamp is visible, not silent: `doctor` prints the vendored version
in the layer's source row, next to the paths it read.
