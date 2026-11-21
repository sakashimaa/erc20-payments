import { mnemonicToSeedSync } from "@scure/bip39";
import { ANVIL } from "../fixtures/wallets";
import { HDKey } from "viem/accounts";

interface CreateMerchantBody {
  name: string;
  webhookUrl: string;
  xpub: string;
  firstAddress: string;
}

export const webhookUrl = "http://localhost:3001/api/webhooks/erc20-payments";

const seed = mnemonicToSeedSync(ANVIL.mnemonic);
const root = HDKey.fromMasterSeed(seed);
const node = root.derive("m/44'/60'/0'/0");

const xpub = node.publicExtendedKey;

export const validMerchantBody = (
  overrides?: Partial<CreateMerchantBody>,
): CreateMerchantBody => {
  return {
    name: "yokoshima",
    webhookUrl,
    xpub,
    firstAddress: ANVIL.addresses[0],
    ...overrides,
  };
};
