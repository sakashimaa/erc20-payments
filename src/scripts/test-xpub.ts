import { mnemonicToSeedSync } from "@scure/bip39";
import { mnemonicToAccount, HDKey } from "viem/accounts";

const MNEMONIC = "test test test test test test test test test test test junk";

const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
const node = root.derive("m/44'/60'/0'/0");

const firstAddress = mnemonicToAccount(MNEMONIC, { addressIndex: 0 }).address;

console.log({
  xpub: node.publicExtendedKey,
  firstAddress,
  xprv: node.privateExtendedKey,
  depth3: root.derive("m/44'/60'/0'").publicExtendedKey,
});
