export type Role = 'regulator' | 'manufacturer' | 'importer' | 'pharmacy';

export type BatchStatusView = 'ACTIVE' | 'RECALLED';

export interface BatchView {
  id: string;
  manufacturer: string;
  status: BatchStatusView;
  expiry: number;
  unitsRoot: string;
  metadataHash: string;
  imported: boolean;
  importedBy?: string;
  termsCommitment?: string;
  unitCount: number;
}

export type ScanOutcome =
  | 'AUTHENTIC'
  | 'RECALLED'
  | 'EXPIRED'
  | 'CLONE'
  | 'NOT_IMPORTED'
  | 'NOT_IN_BATCH'
  | 'UNKNOWN'
  | 'REVOKED'
  | 'NOT_A_PHARMACY';

export interface ScanResult {
  pharmacy: string;
  batchId: string;
  unitCode: string;
  outcome: ScanOutcome;
  detail: string;
  nullifier?: string;
  at: number;
}

export interface LedgerView {
  batchCount: number;
  partyCount: number;
  batches: BatchView[];
  dispensed: string[];
  revoked: string[];
}

export type ActivityKind = 'info' | 'success' | 'error' | 'pending';

export interface Activity {
  id: string;
  at: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
  txId?: string;
}

export type TxStage =
  | 'idle'
  | 'building'
  | 'proving'
  | 'balancing'
  | 'submitting'
  | 'finalized'
  | 'failed';

export interface WalletState {
  available: boolean;
  connecting: boolean;
  connected: boolean;
  walletName?: string;
  address?: string;
  networkId?: string;
  error?: string;
}

export interface NetworkConfig {
  id: string;
  label: string;
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  faucet?: string;
  requiresBlockfrost?: boolean;
}
