import { expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "..", "scripts", "install.sh");

async function runInstall(
  binDir: string,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([script, ...args], {
    cwd: "/tmp",
    env: { ...process.env, AGENTKEYS_INSTALL_BIN_DIR: binDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("installer refuses to overwrite a foreign file", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  writeFileSync(join(binDir, "agentkeys"), "foreign\n");
  const result = await runInstall(binDir, "--install");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Refusing to manage foreign file");
});

test("installer refuses to remove a foreign symlink", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  symlinkSync("/tmp/nope", join(binDir, "agentkeys"));
  const result = await runInstall(binDir, "--uninstall");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Refusing to manage foreign symlink");
});

test("installer refuses forged ownership markers", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  writeFileSync(
    join(binDir, "agentkeys"),
    "#!/usr/bin/env bash\n# agentkeys-managed-wrapper\n# agentkeys-source-root: forged\nexec true\n",
  );
  const result = await runInstall(binDir, "--install");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Refusing to manage foreign file");
});

test("installer refuses a symlink bin directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  const real = join(root, "real");
  const link = join(root, "link");
  rmSync(real, { force: true, recursive: true });
  symlinkSync(root, link);
  const result = await runInstall(link, "--install");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Refusing symlink bin directory");
});

test("installer rejects extra arguments", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  const result = await runInstall(binDir, "--help", "extra");
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("Expected exactly one installer option");
});

test("installer writes and removes only its managed wrapper", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "agentkeys-install-"));
  const install = await runInstall(binDir, "--install");
  expect(install.exitCode).toBe(0);
  const target = join(binDir, "agentkeys");
  expect(existsSync(target)).toBe(true);
  const wrapper = readFileSync(target, "utf8");
  expect(wrapper).toContain("agentkeys-managed-wrapper");
  expect(wrapper).toContain("src/cli.ts");

  const uninstall = await runInstall(binDir, "--uninstall");
  expect(uninstall.exitCode).toBe(0);
  expect(existsSync(target)).toBe(false);
});
