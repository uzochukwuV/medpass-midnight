import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum PartyRole { MANUFACTURER = 0, IMPORTER = 1, PHARMACY = 2 }

export enum BatchStatus { ACTIVE = 0, RECALLED = 1 }

export type BatchRecord = { manufacturer: Uint8Array;
                            expiry: bigint;
                            units_root: { field: bigint };
                            metadata_hash: Uint8Array;
                            status: BatchStatus
                          };

export type ImportPermit = { terms_commitment: Uint8Array };

export type Witnesses<PS> = {
  caller_sk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  manufacturer_path(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                                  path: { sibling: { field: bigint
                                                                                                   },
                                                                                          goes_left: boolean
                                                                                        }[]
                                                                                }];
  importer_path(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                              path: { sibling: { field: bigint
                                                                                               },
                                                                                      goes_left: boolean
                                                                                    }[]
                                                                            }];
  pharmacy_path(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                              path: { sibling: { field: bigint
                                                                                               },
                                                                                      goes_left: boolean
                                                                                    }[]
                                                                            }];
  unit_code(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  register_party(context: __compactRuntime.CircuitContext<PS>,
                 role_0: PartyRole,
                 party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revoke_party(context: __compactRuntime.CircuitContext<PS>,
               party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  create_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array,
               manufacturer_root_0: { field: bigint },
               units_root_0: { field: bigint },
               expiry_0: bigint,
               metadata_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  record_import(context: __compactRuntime.CircuitContext<PS>,
                batch_id_0: Uint8Array,
                importer_root_0: { field: bigint },
                terms_commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recall_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify(context: __compactRuntime.CircuitContext<PS>,
         batch_id_0: Uint8Array,
         pharmacy_root_0: { field: bigint },
         unit_path_0: { leaf: Uint8Array,
                        path: { sibling: { field: bigint }, goes_left: boolean }[]
                      }): __compactRuntime.CircuitResults<PS, []>;
  dispense(context: __compactRuntime.CircuitContext<PS>,
           batch_id_0: Uint8Array,
           pharmacy_root_0: { field: bigint },
           unit_path_0: { leaf: Uint8Array,
                          path: { sibling: { field: bigint }, goes_left: boolean
                                }[]
                        }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  register_party(context: __compactRuntime.CircuitContext<PS>,
                 role_0: PartyRole,
                 party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revoke_party(context: __compactRuntime.CircuitContext<PS>,
               party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  create_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array,
               manufacturer_root_0: { field: bigint },
               units_root_0: { field: bigint },
               expiry_0: bigint,
               metadata_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  record_import(context: __compactRuntime.CircuitContext<PS>,
                batch_id_0: Uint8Array,
                importer_root_0: { field: bigint },
                terms_commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recall_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify(context: __compactRuntime.CircuitContext<PS>,
         batch_id_0: Uint8Array,
         pharmacy_root_0: { field: bigint },
         unit_path_0: { leaf: Uint8Array,
                        path: { sibling: { field: bigint }, goes_left: boolean }[]
                      }): __compactRuntime.CircuitResults<PS, []>;
  dispense(context: __compactRuntime.CircuitContext<PS>,
           batch_id_0: Uint8Array,
           pharmacy_root_0: { field: bigint },
           unit_path_0: { leaf: Uint8Array,
                          path: { sibling: { field: bigint }, goes_left: boolean
                                }[]
                        }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  participant_id(sk_0: Uint8Array): Uint8Array;
  party_leaf(party_id_0: Uint8Array): Uint8Array;
  unit_commitment(unit_code_0: Uint8Array): Uint8Array;
  unit_nullifier(uc_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  participant_id(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  party_leaf(context: __compactRuntime.CircuitContext<PS>,
             party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  unit_commitment(context: __compactRuntime.CircuitContext<PS>,
                  unit_code_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  unit_nullifier(context: __compactRuntime.CircuitContext<PS>, uc_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  register_party(context: __compactRuntime.CircuitContext<PS>,
                 role_0: PartyRole,
                 party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revoke_party(context: __compactRuntime.CircuitContext<PS>,
               party_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  create_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array,
               manufacturer_root_0: { field: bigint },
               units_root_0: { field: bigint },
               expiry_0: bigint,
               metadata_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  record_import(context: __compactRuntime.CircuitContext<PS>,
                batch_id_0: Uint8Array,
                importer_root_0: { field: bigint },
                terms_commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recall_batch(context: __compactRuntime.CircuitContext<PS>,
               batch_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify(context: __compactRuntime.CircuitContext<PS>,
         batch_id_0: Uint8Array,
         pharmacy_root_0: { field: bigint },
         unit_path_0: { leaf: Uint8Array,
                        path: { sibling: { field: bigint }, goes_left: boolean }[]
                      }): __compactRuntime.CircuitResults<PS, []>;
  dispense(context: __compactRuntime.CircuitContext<PS>,
           batch_id_0: Uint8Array,
           pharmacy_root_0: { field: bigint },
           unit_path_0: { leaf: Uint8Array,
                          path: { sibling: { field: bigint }, goes_left: boolean
                                }[]
                        }): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly regulator: Uint8Array;
  manufacturers: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  importers: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  pharmacies: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  batches: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): BatchRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, BatchRecord]>
  };
  imports: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): ImportPermit;
    [Symbol.iterator](): Iterator<[Uint8Array, ImportPermit]>
  };
  dispensed: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  revoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly batch_count: bigint;
  readonly party_count: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
