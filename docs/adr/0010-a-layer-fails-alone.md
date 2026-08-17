# 0010 — A layer fails alone

A config that will not parse degrades its own Layer and nothing else: the
command still answers from the Layers that parsed, names the Degraded ones on
stdout where a human reads the answer and on stderr for machine formats, and
exits 0. One malformed herdr file used to abort the process, so every query
about every Layer went dark at once — a strictly worse outcome than a partial
inventory that says what is missing. A verdict computed without a Layer says so
rather than letting that Layer's keys read as free.

Herdr's TOML is parsed with `smol-toml`, not `Bun.TOML`, which tokenizes a `[[`
opening a value as an array-of-tables header and so rejects herdr's documented
sidebar row layout.
