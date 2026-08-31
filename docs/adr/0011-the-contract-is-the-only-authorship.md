# 0011 — The contract is the only authorship

## Status

Accepted.

## Context

The CLI described itself four times over. `descriptor.ts` carried commands and
flags; `AGENT_HELP` in `cli.ts` carried the runbook, the envelope, and the exit
codes as a hand-maintained string; `helpJson` projected a second machine schema
with its own vocabulary (`choice`, `text`, `flag`); and `skills/keys/SKILL.md`
taught all of it again. Nothing compared them. A flag's allowed values were
spelled twice — once in `allowed`, once inside the flag's own summary — and its
default only ever in prose.

The fleet's agent contract (`~/code/agentstart/config/agent-contract/`) exists
for exactly this: one machine-readable self-description per `agent*` CLI,
published as `<cli> guide --json`.

## Decision

`guide --json` is the one authored description. `--help`, `--agent-help`, and
`--agent-teaser` render from it and hold no prose of their own. `descriptor.ts`
supplies the mechanical layer — the same list the parser enforces, so a
published flag cannot be one the CLI rejects — and `contract.ts` supplies the
conceptual layer and every render.

`--help-json` is retired rather than re-rendered. It described one command at a
time, in a vocabulary nothing else used, and `guide --json` describes all of
them in the fleet's.

Every command is `audience: agent` and `mutates: false`. `doctor` is the
fleet's usual name for an operator verb, but this one diagnoses the machine's
keymap rather than the tool's health and it is the first move the runbook
prescribes, so hiding it from the agent surface would remove the most
recommended command in the CLI.

## Consequences

Adding a command or a flag means adding it to `descriptor.ts`; help, the
contract, and validation follow. Adding an `AgentkeysError` code means adding
it to `concepts.error_codes`, and the conformance test in `test/contract.test.ts`
holds the shape. A consumer that read `--help-json` must read `guide --json`.
