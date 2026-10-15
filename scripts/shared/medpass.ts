// Compiled-contract wrapper for network runs. Binds the Compact witnesses to a
// mutable "who is acting now" context so a single compiled contract can be
// called by the regulator, a manufacturer, an importer and a pharmacy in turn.
//
// Every secret (caller_sk, the Merkle paths, the scanned unit code) is supplied
// through a WITNESS, never as a circuit argument, so nothing sensitive enters
// the public proof preimage.

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract, type Witnesses } from '../../src/managed/medpass/contract/index.js';
import { zkConfigPath } from './wallet.js';

type PS = Record<string, never>;
type Path = { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };

export interface ActiveContext {
  callerSk: Uint8Array;
  manufacturerPath?: Path;
  importerPath?: Path;
  pharmacyPath?: Path;
  unitCode?: Uint8Array;
}

const active: ActiveContext = { callerSk: new Uint8Array(32) };

export function setActive(ctx: ActiveContext): void {
  active.callerSk = ctx.callerSk;
  active.manufacturerPath = ctx.manufacturerPath;
  active.importerPath = ctx.importerPath;
  active.pharmacyPath = ctx.pharmacyPath;
  active.unitCode = ctx.unitCode;
}

export function createCompiledMedPass() {
  const witnesses: Witnesses<PS> = {
    caller_sk: ({ privateState }) => [privateState, active.callerSk],
    manufacturer_path: ({ privateState }) => [privateState, active.manufacturerPath!],
    importer_path: ({ privateState }) => [privateState, active.importerPath!],
    pharmacy_path: ({ privateState }) => [privateState, active.pharmacyPath!],
    unit_code: ({ privateState }) => [privateState, active.unitCode!],
  };

  return CompiledContract.make('medpass', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}
