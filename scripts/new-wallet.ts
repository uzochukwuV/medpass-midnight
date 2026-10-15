// Generate (or import) a Midnight wallet and print its public addresses so it
// can be funded from a faucet and then used as the deployer for MedPass.
//
// The 24-word mnemonic is the ONLY secret; every address below is derived from
// it. Fund the `unshielded` address with NIGHT. DUST is generated from the
// registered NIGHT UTXOs automatically by the wallet at runtime.
//
// Usage:
//   node --import tsx scripts/new-wallet.ts [undeployed|preview|preprod] [outfile]
//   MEDPASS_WALLET_MNEMONIC="<24 words>" node --import tsx scripts/new-wallet.ts preprod
//
// Writes a JSON file (default: .secrets/<network>-wallet.json, chmod 600) and
// prints it. Keep that file out of version control.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
  DustAddress,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { WalletSeeds } from '@midnight-ntwrk/testkit-js';
import { DustSecretKey, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';

import { networkInfo, resolveNetwork, resolveNetworkConfig } from './shared/network.js';
import { projectRoot } from './shared/wallet.js';

const network = resolveNetwork(process.argv[2]);

const imported = process.env.MEDPASS_WALLET_MNEMONIC?.trim();
const mnemonic = imported || generateMnemonic(wordlist, 256);
const seeds = WalletSeeds.fromMnemonic(mnemonic);

const keystore = createKeystore(seeds.unshielded, network);
const unshieldedAddress = keystore.getBech32Address().asString();

const zswap = ZswapSecretKeys.fromSeed(seeds.shielded);
// The bundled ledger .d.ts is older than the wasm: `public_key()` exists at
// runtime but is missing from the type, so reach it through a narrow cast.
const encryptionPublicKey = (zswap.encryptionSecretKey as unknown as { public_key(): Uint8Array }).public_key();
const shieldedAddress = ShieldedAddress.codec
  .encode(network, new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(zswap.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(Buffer.from(encryptionPublicKey).toString('hex')),
  ))
  .asString();

const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);
const dustAddress = DustAddress.encodePublicKey(network, dustSecretKey.publicKey);

// Endpoints are recorded for convenience, but a Blockfrost-backed network has
// no token yet at wallet-creation time (you need the address before you can get
// one), so a missing token is not an error here.
let config: unknown;
try {
  config = resolveNetworkConfig(network);
} catch (err) {
  config = { note: (err as Error).message };
}
const info = networkInfo(network);
const outFile = process.argv[3] ?? path.join(projectRoot, '.secrets', `${network}-wallet.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });

const record = {
  network,
  createdAt: new Date().toISOString(),
  warning: 'SECRET. This mnemonic controls the funds and the deployer identity. Never commit or share it.',
  mnemonic,
  addresses: {
    unshielded: unshieldedAddress,
    shielded: shieldedAddress,
    dust: dustAddress,
  },
  endpoints: config,
};
fs.writeFileSync(outFile, JSON.stringify(record, null, 2), { mode: 0o600 });

console.log();
console.log(`Midnight wallet for network "${network}" (${imported ? 'imported' : 'newly generated'})`);
console.log('─'.repeat(72));
console.log(`unshielded (fund this): ${unshieldedAddress}`);
console.log(`shielded:               ${shieldedAddress}`);
console.log(`dust:                   ${dustAddress}`);
console.log('─'.repeat(72));
console.log(`mnemonic (SECRET):      ${mnemonic}`);
console.log('─'.repeat(72));
console.log(`Written to ${outFile} (mode 600). Keep it out of version control.`);
console.log();

if (info.faucet) {
  console.log(`Fund it from the ${network} faucet:`);
  console.log(`  ${info.faucet}`);
  console.log('Paste the unshielded address above; the faucet sends tNIGHT.');
} else {
  console.log('The local devnet has no faucet; use the midnight-local-dev funding menu.');
}
if (info.requiresBlockfrost) {
  console.log();
  console.log('This network is served by Blockfrost. Create a Midnight Preprod project');
  console.log('at https://blockfrost.io (id starts with "nightpreprod") and export it:');
  console.log('  export BLOCKFROST_PROJECT_ID=<your project id>');
}
console.log();
console.log('Then register the NIGHT for DUST and deploy:');
console.log('  1. The wallet registers its NIGHT for DUST on first sync (takes ~5 min on a devnet).');
console.log(`  2. MEDPASS_WALLET_MNEMONIC="<mnemonic>" npm run run:${network === 'undeployed' ? 'local' : network}`);
console.log();
