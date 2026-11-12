import { parseArgs } from "node:util";
import {
  deriveAddress,
  InvalidMnemonicError,
  xpubFromMnemonic,
} from "../lib/hd";
import { parseNumberSafe } from "../lib/parse";

const HELP = `Usage: export-xpub [options] < mnemonic.txt

Derives the BIP44 account xpub and first receive address from a BIP39 mnemonic,
for registering a merchant. Runs fully offline and never prints secrets.

Input (stdin):
  line 1    BIP39 mnemonic (12 or 24 words)
  line 2    BIP39 passphrase (only with --passphrase)
  Interactive: type the mnemonic, then press Ctrl+D (Windows: Ctrl+Z, Enter).

Options:
  --account <n>   account index, 0..2147483647 (default: 0)
                  derivation path: m/44'/60'/<n>'/0
  --passphrase    read a BIP39 passphrase from the second line of stdin
  --json          print JSON to stdout (for jq/curl); messages go to stderr
  -h, --help      show this help

Examples:
  export-xpub < mnemonic.txt
  export-xpub --account 1 --passphrase < secrets.txt
  export-xpub --json < mnemonic.txt | jq .

Exit codes: 0 success, 1 invalid input or error`;

if (process.stdin.isTTY) {
  console.error("Enter mnemonic, then CTRL + D");
}

let args;
try {
  args = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      account: { type: "string", default: "0" },
      json: { type: "boolean", default: false },
      passphrase: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  if (e instanceof Error) console.error(e.message);
  else console.log("unknown error", e);

  console.log("see --help");
  process.exit(1);
}

const values = args.values;
const { help, account } = values;

if (help) {
  console.log(HELP);
  process.exit(0);
}

const input = await Bun.stdin.text();
const [first = "", ...rest] = input.split("\n");
const mnemonic = first.trim();
const passphrase = values.passphrase
  ? rest.join("\n").replace(/\r?\n$/, "")
  : "";

if (values.passphrase && (!passphrase || passphrase === "")) {
  console.error("passphrase is required");
  process.exit(1);
}

const accountParsed = parseNumberSafe(account);
if (
  accountParsed === null ||
  !Number.isInteger(accountParsed) ||
  accountParsed < 0 ||
  accountParsed >= 2 ** 31
) {
  console.error("failed to parse account number. pass valid number");
  process.exit(1);
}

try {
  const xpub = xpubFromMnemonic(mnemonic, {
    account: accountParsed,
    passphrase,
  });

  console.log(`xpub: ${xpub}`);
  console.log(`first address: ${deriveAddress(xpub, 0)}`);
} catch (e) {
  if (e instanceof InvalidMnemonicError) {
    console.error("invalid mnemonic passed");
    process.exit(1);
  }

  console.error("unexpected error occured", e);
  process.exit(1);
}
