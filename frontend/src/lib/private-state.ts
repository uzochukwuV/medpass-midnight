// A browser private-state provider.
//
// Midnight.js ships `levelPrivateStateProvider`, which is backed by classic-level
// (a native LevelDB addon) and therefore cannot run in a browser. This is the
// in-memory provider used by Midnight's own browser examples, adapted here.
//
// Upstream: https://github.com/midnightntwrk/example-bboard (bboard-ui/src/in-memory-private-state-provider.ts)
// Copyright (C) Midnight Foundation — Apache License 2.0. Adapted for MedPass.
//
// Private state is scoped by contract address, matching the interface
// midnight-js expects (`setContractAddress` is called on deploy/join).

import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

export const inMemoryPrivateStateProvider = <PSI extends PrivateStateId, PS = unknown>(): PrivateStateProvider<
  PSI,
  PS
> => {
  const privateStates = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let contractAddress: ContractAddress | null = null;

  const requireContractAddress = (): ContractAddress => {
    if (contractAddress === null) {
      throw new Error('Contract address not set. Call setContractAddress() before accessing private state.');
    }
    return contractAddress;
  };

  const getScopedStates = (address: ContractAddress): Map<PSI, PS> => {
    let scopedStates = privateStates.get(address);
    if (!scopedStates) {
      scopedStates = new Map<PSI, PS>();
      privateStates.set(address, scopedStates);
    }
    return scopedStates;
  };

  const encode = <T>(value: T): string => JSON.stringify(value);
  const decode = <T>(value: string): T => JSON.parse(value) as T;

  const exportPrivateStatePayload = (address: ContractAddress): Record<string, string> =>
    Object.fromEntries(
      Array.from(getScopedStates(address).entries()).map(([stateId, value]) => [stateId, encode(value)]),
    );

  const exportSigningKeyPayload = (): Record<ContractAddress, SigningKey> => Object.fromEntries(signingKeys.entries());

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },

    set(key: PSI, state: PS): Promise<void> {
      getScopedStates(requireContractAddress()).set(key, state);
      return Promise.resolve();
    },

    get(key: PSI): Promise<PS | null> {
      const value = getScopedStates(requireContractAddress()).get(key) ?? null;
      return Promise.resolve(value);
    },

    remove(key: PSI): Promise<void> {
      getScopedStates(requireContractAddress()).delete(key);
      return Promise.resolve();
    },

    clear(): Promise<void> {
      privateStates.delete(requireContractAddress());
      return Promise.resolve();
    },

    setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(address, signingKey);
      return Promise.resolve();
    },

    getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return Promise.resolve(signingKeys.get(address) ?? null);
    },

    removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(address);
      return Promise.resolve();
    },

    clearSigningKeys(): Promise<void> {
      signingKeys.clear();
      return Promise.resolve();
    },

    exportPrivateStates(options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      void options;
      const address = requireContractAddress();
      return Promise.resolve({
        format: 'midnight-private-state-export',
        encryptedPayload: encode({ contractAddress: address, states: exportPrivateStatePayload(address) }),
        salt: 'medpass-in-memory-private-state-provider',
      });
    },

    importPrivateStates(
      exportData: PrivateStateExport,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const address = requireContractAddress();
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const payload = decode<{ states?: Record<string, string> }>(exportData.encryptedPayload);
      const states = payload.states ?? {};
      const scopedStates = getScopedStates(address);
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;

      for (const [rawStateId, serializedState] of Object.entries(states)) {
        const stateId = rawStateId as PSI;
        if (scopedStates.has(stateId)) {
          if (conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === 'error') {
            return Promise.reject(new Error(`Private state conflict for '${stateId}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        scopedStates.set(stateId, decode<PS>(serializedState));
      }

      return Promise.resolve({ imported, skipped, overwritten });
    },

    exportSigningKeys(options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      void options;
      return Promise.resolve({
        format: 'midnight-signing-key-export',
        encryptedPayload: encode({ keys: exportSigningKeyPayload() }),
        salt: 'medpass-in-memory-signing-key-provider',
      });
    },

    importSigningKeys(
      exportData: SigningKeyExport,
      options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const payload = decode<{ keys?: Record<ContractAddress, SigningKey> }>(exportData.encryptedPayload);
      const keys = payload.keys ?? {};
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;

      for (const [address, signingKey] of Object.entries(keys)) {
        if (signingKeys.has(address)) {
          if (conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === 'error') {
            return Promise.reject(new Error(`Signing key conflict for '${address}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        signingKeys.set(address, signingKey);
      }

      return Promise.resolve({ imported, skipped, overwritten });
    },
  };
};
