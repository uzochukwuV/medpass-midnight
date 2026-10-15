// Preflight for a real-network deploy: verify the Blockfrost token (where
// required), node + indexer connectivity, the wallet's NIGHT balance, and that
// DUST is (or can be) generated. Run this before `run:<network>` so a funding
// or endpoint problem is obvious instead of buried in a sync timeout.
//
// Usage:
//   npm run preflight -- preview
//   BLOCKFROST_PROJECT_ID=nightpreprod... npm run preflight -- preprod
//
// Reads the mnemonic from .secrets/<network>-wallet.json (written by
// `npm run wallet:new`) or from MEDPASS_WALLET_MNEMONIC.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { networkInfo, resolveNetwork, resolveNetworkConfig } from './shared/network.js';
import { buildWallet, ensureDust, projectRoot, waitForUnshieldedSynced } from './shared/wallet.js';
import * as Rx from 'rxjs';

const network = resolveNetwork(process.argv[2]);

function loadMnemonic(net: string): string {
  const fromEnv = process.env.MEDPASS_WALLET_MNEMONIC?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(projectRoot, '.secrets', `${net}-wallet.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No wallet for "${net}". Run: npm run wallet:new -- ${net}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).mnemonic;
}

function ok(label: string, detail = ''): void {
  console.log(`  [ok]   ${label}${detail ? ` — ${detail}` : ''}`);
}
function bad(label: string, detail = ''): void {
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function rpc(url: string, method: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
  });
  return res.json();
}

async function gql(url: string, query: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main(): Promise<void> {
  console.log(`\nMedPass preflight — network "${network}"`);
  console.log('─'.repeat(72));

  const info = networkInfo(network);
  let config;
  try {
    config = resolveNetworkConfig(network);
    ok('endpoint config', info.requiresBlockfrost ? 'Blockfrost token applied' : 'no token needed');
  } catch (err) {
    bad('endpoint config', (err as Error).message);
    process.exitCode = 1;
    return;
  }

  // Node + indexer reachability.
  try {
    const chain = await rpc(config.node, 'system_chain');
    if (chain.result) ok('node rpc', chain.result);
    else bad('node rpc', JSON.stringify(chain).slice(0, 120));
  } catch (err) {
    bad('node rpc', (err as Error).message);
  }
  try {
    const blk = await gql(config.indexer, '{ block { height } }');
    if (blk?.data?.block?.height != null) ok('indexer', `block ${blk.data.block.height}`);
    else bad('indexer', JSON.stringify(blk).slice(0, 120));
  } catch (err) {
    bad('indexer', (err as Error).message);
  }

  // Proof server (always local).
  try {
    const health = await fetch(`${config.proofServer}/health`).then((r) => r.json());
    ok('proof server', health.status);
  } catch (err) {
    bad('proof server', `${config.proofServer} — ${(err as Error).message}`);
  }

  // Wallet sync + balances.
  const mnemonic = loadMnemonic(network);
  console.log(`\n  syncing wallet (this can take minutes on ${network})...`);
  const ctx = await buildWallet(config, mnemonic);
  try {
    await waitForUnshieldedSynced(ctx.wallet);
    const u = await Rx.firstValueFrom(ctx.wallet.unshielded.state);
    const balances = u.balances as Record<string, bigint>;
    const entries = Object.entries(balances).filter(([, v]) => v > 0n);
    if (entries.length === 0) {
      bad('NIGHT balance', 'zero — fund the unshielded address from the faucet');
      console.log(`         address: ${ctx.unshieldedKeystore.getBech32Address().asString()}`);
      if (info.faucet) console.log(`         faucet:  ${info.faucet}`);
      process.exitCode = 1;
    } else {
      for (const [token, amount] of entries) ok('balance', `${amount} of ${token}`);
    }

    console.log('  registering NIGHT for DUST (may take ~5 min)...');
    const dust = await ensureDust(ctx);
    ok('DUST spendable', `${dust}`);
  } catch (err) {
    bad('wallet', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await ctx.wallet.stop().catch(() => {});
  }

  console.log('─'.repeat(72));
  console.log(process.exitCode ? 'Preflight FAILED — fix the [FAIL] lines above.' : 'Preflight OK — ready to deploy.');
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
