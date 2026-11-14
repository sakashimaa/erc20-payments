import { describe, expect, test } from "bun:test";
import { ANVIL } from "../../tests/fixtures/wallets";
import { deriveAddress } from "../lib/hd";

const CLI = `${import.meta.dir}/export-xpub.ts`;

const run = async (args: string[], stdin = "") => {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
};

const STDIN = ANVIL.mnemonic + "\n";

const runOk = async (args: string[], stdin: string) => {
  const { stdout, stderr, exitCode } = await run(args, stdin);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);

  const xpub = stdout.match(/^xpub: (xpub\w+)$/m)?.[1];
  const address = stdout.match(/^first address: (0x[0-9a-f]{40})$/m)?.[1];

  if (!xpub || !address) throw new Error(`unexpected stdout: ${stdout}`);

  return { xpub, address };
};

describe("export-xpub CLI", () => {
  test("prints xpub and correct first address for anvil mnemonic", async () => {
    const { xpub, address } = await runOk([], STDIN);

    expect(deriveAddress(xpub, 1)).toBe(ANVIL.addresses[1]);
    expect(address).toBe(ANVIL.addresses[0]);
  });

  test("different account gives different xpub", async () => {
    const [plain, firstAccount] = await Promise.all([
      runOk([], STDIN),
      runOk(["--account", "1"], STDIN),
    ]);

    expect(plain.xpub).not.toBe(firstAccount.xpub);
  });

  test("passphrase gives different xpub", async () => {
    const [plain, withPassphrase] = await Promise.all([
      runOk([], STDIN),
      runOk(["--passphrase"], STDIN + "goodfck\n"),
    ]);

    expect(withPassphrase.xpub).not.toBe(plain.xpub);
  });

  test("empty passphrase gives error", async () => {
    const result = await run(["--passphrase"], STDIN);

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: "",
    });
    expect(result.stderr).toContain("passphrase is required");
  });

  test.each(["-1", "1.5", "abc", "2147483648"])(
    "rejects --account %s",
    async (account) => {
      const result = await run([`--account=${account}`], STDIN);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
    },
  );
});
