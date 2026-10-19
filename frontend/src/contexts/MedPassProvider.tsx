import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  connectWallet,
  discoverWallets,
  hintWalletUsage,
  isStillConnected,
  readBalances,
  walletsAvailable,
  type ConnectedWallet,
  type DiscoveredWallet,
  type WalletBalances,
} from '../lib/wallet';
import {
  identityKeyBytes,
  importIdentity,
  loadIdentity,
  regenerateIdentity,
  type Identity,
} from '../lib/identity';
import { createLiveSession, type LiveSession } from '../lib/live';
import { DEFAULT_NETWORK, DEPLOYED_ADDRESS } from '../lib/network';
import type {
  Activity,
  ActivityKind,
  BatchView,
  LedgerView,
  Role,
  ScanResult,
  TxStage,
  WalletState,
} from '../lib/types';

interface EnrolmentStatus {
  enrolled: boolean;
  revoked: boolean;
}

export interface PendingRequest {
  id: string;
  role: Exclude<Role, 'regulator'>;
  partyId: string;
  label: string;
  at: number;
}

interface Ctx {
  ready: boolean;
  networkId: string;
  setNetworkId: (id: string) => void;

  wallet: WalletState;
  /** Wallets injected into this page, for the picker. */
  wallets: DiscoveredWallet[];
  connect: (walletKey?: string) => Promise<void>;
  disconnect: () => void;
  balances: WalletBalances | null;
  refreshBalances: () => void;

  identity: Identity;
  regenerate: () => void;
  /** Adopt a supplied 32-byte secret key as this device's identity. */
  importKey: (secretKey: string) => void;
  /** The full secret key, for the operator to back up. */
  revealSecret: () => string;

  ledger: LedgerView | null;
  refresh: () => void;
  batches: BatchView[];

  /** The acting party's enrolment. The registry is not enumerable, so this is a self-check. */
  enrolment: (role: Exclude<Role, 'regulator'>) => EnrolmentStatus;
  refreshEnrolment: () => void;
  /** Enrolment requests raised from /app/register, awaiting the regulator. */
  pendingRequests: PendingRequest[];
  requestEnrolment: (role: Exclude<Role, 'regulator'>, label: string) => void;
  dismissRequest: (id: string) => void;

  busy: string | null;
  stage: TxStage;
  activity: Activity[];
  clearActivity: () => void;

  lastScan: ScanResult | null;
  /** Every scan this browser has run, newest first. */
  scans: ScanResult[];

  // actions
  register: (role: Role, partyId?: string) => Promise<void>;
  revoke: (partyId: string) => Promise<void>;
  reRegister: (role: Exclude<Role, 'regulator'>, partyId: string) => Promise<void>;
  createBatch: (batchId: string, codes: string[], expiryDays: number, metadata: string) => Promise<void>;
  recordImport: (batchId: string, terms: string) => Promise<void>;
  recall: (batchId: string) => Promise<void>;
  scan: (batchId: string, unitCode: string, dispense: boolean) => Promise<ScanResult | null>;

  contractAddress: string;
  setContractAddress: (a: string) => void;
  deploy: () => Promise<void>;
  join: (address: string) => Promise<void>;
}

export const MedPassContext = createContext<Ctx | null>(null);

export function MedPassProvider({ children }: { children: ReactNode }) {
  const value = useMedPassState();
  return <MedPassContext.Provider value={value}>{children}</MedPassContext.Provider>;
}

let idSeq = 0;
const nextId = () => `a${++idSeq}`;

const IDLE_STAGE: TxStage = 'idle';

/** Persisted so a refresh does not lose the transaction log or the request queue. */
function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the session still works, it just does not persist */
  }
}

const ACTIVITY_KEY = 'medpass.activity.v1';
const REQUESTS_KEY = 'medpass.enrolment-requests.v1';
const SCANS_KEY = 'medpass.scans.v1';

export function useMedPassState(): Ctx {
  const [ready, setReady] = useState(false);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [wallet, setWallet] = useState<WalletState>({ available: false, connecting: false, connected: false });
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [identity, setIdentity] = useState<Identity>(() => loadIdentity());
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<TxStage>(IDLE_STAGE);
  const [activity, setActivity] = useState<Activity[]>(() => loadStored<Activity[]>(ACTIVITY_KEY, []));
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [scans, setScans] = useState<ScanResult[]>(() => loadStored<ScanResult[]>(SCANS_KEY, []));
  const [contractAddress, setContractAddress] = useState(DEPLOYED_ADDRESS);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(() =>
    loadStored<PendingRequest[]>(REQUESTS_KEY, []),
  );
  const [liveEnrolment, setLiveEnrolment] = useState<Record<string, EnrolmentStatus>>({});
  const [enrolmentTick, setEnrolmentTick] = useState(0);

  const liveRef = useRef<LiveSession | null>(null);
  const walletRef = useRef<ConnectedWallet | null>(null);

  const log = useCallback((kind: ActivityKind, title: string, detail?: string, txId?: string) => {
    setActivity((prev) => [{ id: nextId(), at: Date.now(), kind, title, detail, txId }, ...prev].slice(0, 60));
  }, []);

  useEffect(() => store(ACTIVITY_KEY, activity), [activity]);
  useEffect(() => store(REQUESTS_KEY, pendingRequests), [pendingRequests]);
  useEffect(() => store(SCANS_KEY, scans), [scans]);

  // Boot: detect wallets. The ledger is read from the chain once a session exists.
  useEffect(() => {
    setWallets(discoverWallets());
    setWallet((w) => ({ ...w, available: walletsAvailable() }));
    const onLoad = () => {
      setWallets(discoverWallets());
      setWallet((w) => ({ ...w, available: walletsAvailable() }));
    };
    window.addEventListener('focus', onLoad);
    setReady(true);
    return () => window.removeEventListener('focus', onLoad);
  }, []);

  // A wallet can be disconnected from its own UI, so trust it rather than our
  // local flag.
  useEffect(() => {
    if (!wallet.connected) return;
    const id = setInterval(() => {
      const api = walletRef.current?.api;
      if (!api) return;
      void isStillConnected(api).then((ok) => {
        if (!ok) {
          walletRef.current = null;
          liveRef.current = null;
          setBalances(null);
          setWallet((w) => ({ ...w, connected: false, address: undefined, walletName: undefined }));
          log('info', 'Wallet disconnected');
        }
      });
    }, 5000);
    return () => clearInterval(id);
  }, [wallet.connected, log]);

  const refresh = useCallback(() => {
    if (!liveRef.current) return;
    void liveRef.current
      .readLedger()
      .then(setLedger)
      .catch(() => undefined);
  }, []);

  const refreshBalances = useCallback(() => {
    const api = walletRef.current?.api;
    if (!api) return;
    void readBalances(api).then(setBalances).catch(() => undefined);
  }, []);

  /**
   * The acting party's enrolment. The registry is a Merkle tree of leaf
   * commitments and cannot be enumerated, so each party checks its own status:
   * derive our own leaf, ask for a membership path, and check the revoked set.
   */
  const enrolment = useCallback(
    (role: Exclude<Role, 'regulator'>): EnrolmentStatus => liveEnrolment[role] ?? { enrolled: false, revoked: false },
    // enrolmentTick is a dependency so a refresh re-reads live status
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveEnrolment, enrolmentTick],
  );

  const refreshEnrolment = useCallback(() => setEnrolmentTick((t) => t + 1), []);

  // Poll the self-check when connected. This calls no circuit.
  useEffect(() => {
    if (!wallet.connected) return;
    let cancelled = false;
    const roles: Array<Exclude<Role, 'regulator'>> = ['manufacturer', 'importer', 'pharmacy'];
    void (async () => {
      const session = liveRef.current;
      if (!session) return;
      const next: Record<string, EnrolmentStatus> = {};
      for (const r of roles) {
        try {
          next[r] = await session.enrollmentStatus(r);
        } catch {
          next[r] = { enrolled: false, revoked: false };
        }
      }
      if (!cancelled) setLiveEnrolment(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.connected, enrolmentTick]);

  const requestEnrolment = useCallback(
    (role: Exclude<Role, 'regulator'>, label: string) => {
      const partyId = identity.participantId;
      setPendingRequests((prev) => {
        if (prev.some((r) => r.partyId === partyId && r.role === role)) return prev;
        return [{ id: nextId(), role, partyId, label, at: Date.now() }, ...prev];
      });
      log('info', `Enrolment requested — ${role}`, 'Waiting for the regulator to approve.');
    },
    [identity.participantId, log],
  );

  const dismissRequest = useCallback((id: string) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<string | void>): Promise<void> => {
      setBusy(label);
      setStage('building');
      const started = Date.now();
      try {
        const txId = await fn();
        setStage('finalized');
        log('success', label, `${Date.now() - started} ms`, typeof txId === 'string' ? txId : undefined);
        refresh();
        refreshEnrolment();
        refreshBalances();
      } catch (e) {
        setStage('failed');
        log('error', `${label} failed`, e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        setTimeout(() => setStage(IDLE_STAGE), 1500);
      }
    },
    [log, refresh, refreshEnrolment, refreshBalances],
  );

  const connect = useCallback(
    async (walletKey?: string) => {
      setWallet((w) => ({ ...w, connecting: true, error: undefined }));
      try {
        const connected = await connectWallet(networkId, walletKey);
        walletRef.current = connected;
        setWallet({
          available: true,
          connecting: false,
          connected: true,
          walletName: connected.name,
          address: connected.address,
          networkId: connected.networkId,
        });
        log('success', 'Wallet connected', `${connected.name} · ${connected.networkId}`);
        await hintWalletUsage(connected.api);
        refreshBalances();
        refreshEnrolment();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setWallet((w) => ({ ...w, connecting: false, error: msg }));
        log('error', 'Wallet connection failed', msg);
      }
    },
    [networkId, log, refreshBalances, refreshEnrolment],
  );

  const disconnect = useCallback(() => {
    walletRef.current = null;
    liveRef.current = null;
    setBalances(null);
    setWallet((w) => ({ ...w, connected: false, address: undefined, walletName: undefined }));
    log('info', 'Wallet disconnected');
  }, [log]);

  const ensureLive = useCallback(async (): Promise<LiveSession> => {
    if (liveRef.current) return liveRef.current;
    if (!walletRef.current) throw new Error('Connect a wallet first.');
    const session = await createLiveSession({
      wallet: walletRef.current,
      contractAddress,
      identitySecret: identityKeyBytes(identity),
      identityParticipantId: identity.participantId,
      onStage: setStage,
    });
    liveRef.current = session;
    return session;
  }, [contractAddress, identity]);

  const register = useCallback(
    (role: Role, partyId?: string) =>
      run(`Register ${role}`, async () => {
        const session = await ensureLive();
        if (role === 'regulator') throw new Error('The regulator is sealed in the constructor.');
        return session.register(role, partyId ?? identity.participantId);
      }),
    [run, ensureLive, identity.participantId],
  );

  const revoke = useCallback(
    (partyId: string) =>
      run(`Revoke ${partyId.slice(0, 8)}`, async () => (await ensureLive()).revoke(partyId)),
    [run, ensureLive],
  );

  /**
   * Restore a revoked party. `register_party` also removes the leaf from the
   * revoked set, so restoring is the same circuit call as a first enrolment —
   * there is no separate restore entry point in the contract.
   */
  const reRegister = useCallback(
    (role: Exclude<Role, 'regulator'>, partyId: string) =>
      run(`Restore ${partyId.slice(0, 8)}`, async () => (await ensureLive()).register(role, partyId)),
    [run, ensureLive],
  );

  const createBatch = useCallback(
    (batchId: string, codes: string[], expiryDays: number, metadata: string) =>
      run(`Create batch ${batchId}`, async () => (await ensureLive()).createBatch(batchId, codes, expiryDays, metadata)),
    [run, ensureLive],
  );

  const recordImport = useCallback(
    (batchId: string, terms: string) =>
      run(`Record import ${batchId}`, async () => (await ensureLive()).recordImport(batchId, terms)),
    [run, ensureLive],
  );

  const recall = useCallback(
    (batchId: string) => run(`Recall batch ${batchId}`, async () => (await ensureLive()).recall(batchId)),
    [run, ensureLive],
  );

  const scan = useCallback(
    async (batchId: string, unitCode: string, dispense: boolean): Promise<ScanResult | null> => {
      const label = dispense ? `Dispense ${unitCode}` : `Verify ${unitCode}`;
      setBusy(label);
      setStage('building');
      try {
        const session = await ensureLive();
        const result = dispense
          ? await session.dispense(batchId, unitCode)
          : await session.verify(batchId, unitCode);
        setLastScan(result);
        setScans((prev) => [result, ...prev].slice(0, 40));
        setStage('finalized');
        const good = result.outcome === 'AUTHENTIC';
        log(good ? 'success' : 'error', `${unitCode}: ${result.outcome}`, result.detail, result.nullifier);
        refresh();
        return result;
      } catch (e) {
        setStage('failed');
        log('error', `${label} failed`, e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(null);
        setTimeout(() => setStage(IDLE_STAGE), 1500);
      }
    },
    [ensureLive, log, refresh],
  );

  const deploy = useCallback(
    () =>
      run('Deploy contract', async () => {
        const session = await ensureLive();
        const addr = await session.deploy();
        setContractAddress(addr);
        log('info', 'Contract deployed', addr);
        return addr;
      }),
    [run, ensureLive, log],
  );

  const join = useCallback(
    (address: string) =>
      run(`Join ${address.slice(0, 10)}…`, async () => {
        const session = await ensureLive();
        await session.join(address);
        setContractAddress(address);
        return undefined;
      }),
    [run, ensureLive],
  );

  /**
   * Switching identity invalidates the session: the old session's witness holds
   * the previous key, so it must be rebuilt or the app would keep acting as the
   * identity it just replaced.
   */
  const applyIdentity = useCallback(
    (next: Identity, note: string) => {
      liveRef.current = null;
      setIdentity(next);
      setLiveEnrolment({});
      log('info', note, next.participantId.slice(0, 16) + '…');
      refreshEnrolment();
    },
    [log, refreshEnrolment],
  );

  const regenerate = useCallback(() => {
    applyIdentity(regenerateIdentity(), 'New app identity');
  }, [applyIdentity]);

  const importKey = useCallback(
    (secretKey: string) => {
      applyIdentity(importIdentity(secretKey), 'Imported key — this device now acts as');
    },
    [applyIdentity],
  );

  const revealSecret = useCallback(() => identity.secretKey, [identity.secretKey]);

  const batches = useMemo(() => ledger?.batches ?? [], [ledger]);

  return {
    ready,
    networkId,
    setNetworkId,
    wallet,
    wallets,
    connect,
    disconnect,
    balances,
    refreshBalances,
    identity,
    regenerate,
    importKey,
    revealSecret,
    ledger,
    refresh,
    batches,
    enrolment,
    refreshEnrolment,
    pendingRequests,
    requestEnrolment,
    dismissRequest,
    busy,
    stage,
    activity,
    clearActivity: () => setActivity([]),
    lastScan,
    scans,
    register,
    revoke,
    reRegister,
    createBatch,
    recordImport,
    recall,
    scan,
    contractAddress,
    setContractAddress,
    deploy,
    join,
  };
}
