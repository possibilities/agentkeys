import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildContract } from "../src/contract.ts";
import { runCli } from "./helpers.ts";

// The repository owns its own conformance. These assertions restate the fleet
// agent contract's rules deliberately — agentstart's validator is the
// authority, but it lives in a sibling checkout that CI does not have, and a
// contract that only breaks on another machine breaks too late.

const CONTRACT_FIELDS = new Set([
  "contract_version",
  "meta",
  "guidance",
  "concepts",
  "global_arguments",
  "commands",
]);
const COMMAND_FIELDS = new Set([
  "name",
  "summary",
  "audience",
  "mutates",
  "guidance",
  "blocking",
  "arguments",
  "subcommands",
  "stdin",
  "constraints",
]);
const ARGUMENT_FIELDS = new Set([
  "name",
  "type",
  "description",
  "format",
  "direction",
  "required",
  "positional",
  "repeatable",
  "choices",
  "default",
  "aliases",
  "role",
  "csv",
  "minimum",
  "maximum",
]);

test("guide --json emits the contract inside the standard envelope", async () => {
  const result = await runCli(["guide", "--json"]);
  expect(result.exitCode).toBe(0);
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({ schema_version: 1, ok: true, error: null });
  expect(envelope.data).toEqual(JSON.parse(JSON.stringify(buildContract())));
});

test("the contract conforms to fleet agent contract version 1", () => {
  const contract = buildContract() as unknown as Record<string, unknown>;

  expect(contract["contract_version"]).toBe(1);
  for (const field of Object.keys(contract)) expect(CONTRACT_FIELDS.has(field)).toBe(true);

  // An agent-facing CLI owes the conceptual layer.
  expect(contract["meta"]).toMatchObject({ name: "agentkeys", audience: "agent" });
  expect(typeof contract["guidance"]).toBe("string");
  const concepts = contract["concepts"] as Record<string, any>;
  expect(concepts["output_contract"]["envelope"]).toBeDefined();
  expect(concepts["output_contract"]["exit_codes"]).toBeDefined();
  expect(Array.isArray(concepts["error_codes"])).toBe(true);
  for (const entry of concepts["error_codes"]) {
    expect(typeof entry.code).toBe("string");
    expect(typeof entry.meaning).toBe("string");
  }

  const commands = contract["commands"] as Record<string, any>[];
  expect(commands.length).toBeGreaterThan(0);
  const readOnly: string[] = [];
  for (const command of commands) {
    for (const field of Object.keys(command)) expect(COMMAND_FIELDS.has(field)).toBe(true);
    expect(["agent", "operator", "internal"]).toContain(command["audience"]);
    // Every agentkeys command is a leaf, so every one owes mutates and arguments.
    expect(command["subcommands"]).toBeUndefined();
    expect(typeof command["mutates"]).toBe("boolean");
    expect(Array.isArray(command["arguments"])).toBe(true);
    if (command["mutates"] === false) readOnly.push(command["name"]);
  }

  // read_only_commands is exactly the non-mutating leaves, by full path.
  expect([...(concepts["read_only_commands"] as string[])].sort()).toEqual([...readOnly].sort());

  const args = [
    ...(contract["global_arguments"] as Record<string, any>[]),
    ...commands.flatMap((command) => command["arguments"] as Record<string, any>[]),
  ];
  for (const argument of args) {
    for (const field of Object.keys(argument)) expect(ARGUMENT_FIELDS.has(field)).toBe(true);
    expect(["string", "boolean", "integer", "number"]).toContain(argument["type"]);
    expect(typeof argument["description"]).toBe("string");
    // A flag wears its dashes and a positional does not; the slip produces an
    // argument nobody can pass.
    expect(argument["name"].startsWith("--")).toBe(argument["positional"] !== true);
    if (argument["direction"] !== undefined) expect(argument["format"]).toBe("path");
  }
});

test("help, agent help, and the teaser are renders of the contract", async () => {
  const contract = buildContract();

  const teaser = await runCli(["--agent-teaser"]);
  expect(teaser.stdout.trim()).toBe(contract.meta.purpose);

  const agentHelp = await runCli(["--agent-help"]);
  const guide = await runCli(["guide"]);
  expect(guide.stdout).toBe(agentHelp.stdout);
  for (const command of contract.commands) {
    expect(agentHelp.stdout).toContain(`agentkeys ${command.name} —`);
  }

  const top = await runCli(["--help"]);
  for (const command of contract.commands) expect(top.stdout).toContain(command.name);
});

// The sibling checkout is the authority when it is present; CI has no fleet.
// AGENTKEYS_CONTRACT_VALIDATOR points at a worktree while the script is still
// on a branch.
const VALIDATOR =
  process.env["AGENTKEYS_CONTRACT_VALIDATOR"] ??
  join(homedir(), "code", "agentstart", "scripts", "validate-agent-contract.ts");

test.if(existsSync(VALIDATOR))("agentstart's validator accepts this contract", async () => {
  const contract = `${JSON.stringify({
    schema_version: 1,
    ok: true,
    error: null,
    data: buildContract(),
  })}\n`;
  const path = join(import.meta.dir, "..", "node_modules", ".agentkeys-contract.json");
  await Bun.write(path, contract);
  const run = Bun.spawnSync(["bun", VALIDATOR, "--file", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(`${run.stdout.toString()}${run.stderr.toString()}`).toContain("conforms to version 1");
  expect(run.exitCode).toBe(0);
});
