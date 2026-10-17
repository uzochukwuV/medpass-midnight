import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DemoEngine } from '../lib/demo';
import { PERSONAS } from '../lib/personas';
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
import { identityKeyBytes, loadIdentity, regenerateIdentity, type Identity } from '../lib/identity';
import { createLiveSession, type LiveSession } from '../lib/live';
import { DEFAULT_NETWORK, DEPLOYED_ADDRESS } from '../lib/network';
import { bytesToHex } from '../lib/format';
import type {
  Activity,
  ActivityKind,
  BatchView,
  LedgerView,
  Role,
  RunMode,
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
  mode: RunMode;
  setMode: (m: RunMode) => void;
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

  ledger: LedgerView | null;
  refresh: () => void;
  batches: BatchView[];

  /** The acting party's enrolment for a role. Demo reads the ledger; live self-checks. */
  enrolment: (role: Exclude<Role, 'regulator'>) => EnrolmentStatus;
  /**
   * The party id that acts for a role. Demo acts as a fixed persona, so the
   * persona's id is the one the regulator enrols; live uses this device's id.
   * Anything that names a party for enrolment must use this, not `identity`.
   */
  actingPartyId: (role: Exclude<Role, 'regulator'>) => string;
  refreshEnrolment: () => void;
  /** Enrolment requests raised from /app/register, awaiting the regulator. */
  pendingRequests: PendingRequest[];
  requestEnrolment: (role: Exclude<Role, 'regulator'>, label: string) => void;
  dismissRequest: (id: string) => void;

  busy: string | null;
  stage: TxStage;
  activity: Activity[];
  clearActivity: () => void;

  demoPharmacy: string;
  setDemoPharmacy: (id: string) => void;

  lastScan: ScanResult | null;
  /** Every scan this browser has run, newest first. */
  scans: ScanResult[];

  // actions
  register: (role: Role, partyId?: string) => Promise<void>;
  revoke: (partyId: string) => Promise<void>;
  reRegister: (partyId: string) => Promise<void>;
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
  const [mode, setMode] = useState<RunMode>('demo');
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [wallet, setWallet] = useState<WalletState>({ available: false, connecting: false, connected: false });
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [identity, setIdentity] = useState<Identity>(() => loadIdentity());
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<TxStage>(IDLE_STAGE);
  const [activity, setActivity] = useState<Activity[]>(() => loadStored<Activity[]>(ACTIVITY_KEY, []));
  const [demoPharmacy, setDemoPharmacy] = useState('citycare');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [scans, setScans] = useState<ScanResult[]>(() => loadStored<ScanResult[]>(SCANS_KEY, []));
  const [contractAddress, setContractAddress] = useState(DEPLOYED_ADDRESS);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(() =>
    loadStored<PendingRequest[]>(REQUESTS_KEY, []),
  );
  const [liveEnrolment, setLiveEnrolment] = useState<Record<string, EnrolmentStatus>>({});
  const [enrolmentTick, setEnrolmentTick] = useState(0);

  const engineRef = useRef<DemoEngine | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const walletRef = useRef<ConnectedWallet | null>(null);

  const log = useCallback((kind: ActivityKind, title: string, detail?: string, txId?: string) => {
    setActivity((prev) => [{ id: nextId(), at: Date.now(), kind, title, detail, txId }, ...prev].slice(0, 60));
  }, []);

  useEffect(() => store(ACTIVITY_KEY, activity), [activity]);
  useEffect(() => store(REQUESTS_KEY, pendingRequests), [pendingRequests]);
  useEffect(() => store(SCANS_KEY, scans), [scans]);

  // Boot: create the demo engine and detect wallets.
  useEffect(() => {
    try {
      engineRef.current = DemoEngine.create();
      setLedger(engineRef.current.ledgerView());
    } catch (e) {
      log('error', 'Demo engine failed to start', e instanceof Error ? e.message : String(e));
    }
    setWallets(discoverWallets());
    setWallet((w) => ({ ...w, available: walletsAvailable() }));
    const onLoad = () => {
      setWallets(discoverWallets());
      setWallet((w) => ({ ...w, available: walletsAvailable() }));
    };
    window.addEventListener('focus', onLoad);
    setReady(true);
    return () => window.removeEventListener('focus', onLoad);
  }, [log]);

  // A wallet can be disconnected from its own UI, so trust it rather than our
  // local flag.
  useEffect(() => {
    if (mode !== 'live' || !wallet.connected) return;
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
  }, [mode, wallet.connected, log]);

  const refresh = useCallback(() => {
    if (mode === 'demo' && engineRef.current) {
      setLedger(engineRef.current.ledgerView());
    } else if (mode === 'live' && liveRef.current) {
      void liveRef.current
        .readLedger()
        .then(setLedger)
        .catch(() => undefined);
    }
  }, [mode]);

  const refreshBalances = useCallback(() => {
    const api = walletRef.current?.api;
    if (!api) return;
    void readBalances(api).then(setBalances).catch(() => undefined);
  }, []);

  /**
   * The acting party's enrolment for a role.
   *
   * Demo: the ledger knows the whole cast, so read the persona's revoked flag.
   * Live: the registry is a Merkle tree and cannot be enumerated, so ask the
   * session for a self-check. Both are the same question from the UI's side.
   */
  const enrolment = useCallback(
    (role: Exclude<Role, 'regulator'>): EnrolmentStatus => {
      if (mode === 'demo') {
        const actorId = demoActorFor(role, demoPharmacy);
        const rows =
          role === 'manufacturer'
            ? ledger?.manufacturers
            : role === 'importer'
              ? ledger?.importers
              : ledger?.pharmacies;
        const party = rows?.find((p) => p.id === actorId);
        return { enrolled: !!party, revoked: !!party?.revoked };
      }
      return liveEnrolment[role] ?? { enrolled: false, revoked: false };
    },
    // enrolmentTick is a dependency so a refresh re-reads live status
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, demoPharmacy, ledger, liveEnrolment, enrolmentTick],
  );

  const refreshEnrolment = useCallback(() => setEnrolmentTick((t) => t + 1), []);

  const actingPartyId = useCallback(
    (role: Exclude<Role, 'regulator'>): string => {
      if (mode !== 'demo') return identity.participantId;
      const actorId = demoActorFor(role, demoPharmacy);
      return PERSONAS[actorId]?.participantId ?? identity.participantId;
    },
    [mode, demoPharmacy, identity.participantId],
  );

  // Live mode: poll the self-check when connected. This calls no circuit.
  useEffect(() => {
    if (mode !== 'live' || !wallet.connected) return;
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
  }, [mode, wallet.connected, enrolmentTick]);

  const requestEnrolment = useCallback(
    (role: Exclude<Role, 'regulator'>, label: string) => {
      const partyId = actingPartyId(role);
      setPendingRequests((prev) => {
        if (prev.some((r) => r.partyId === partyId && r.role === role)) return prev;
        return [{ id: nextId(), role, partyId, label, at: Date.now() }, ...prev];
      });
      log('info', `Enrolment requested — ${role}`, 'Waiting for the regulator to approve.');
    },
    [actingPartyId, log],
  );

  const dismissRequest = useCallback((id: string) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<string | void>): Promise<void> => {
      setBusy(label);
      setStage(mode === 'live' ? 'building' : 'proving');
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
    [log, refresh, refreshEnrolment, refreshBalances, mode],
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setWallet((w) => ({ ...w, connecting: false, error: msg }));
        log('error', 'Wallet connection failed', msg);
      }
    },
    [networkId, log, refreshBalances],
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
        if (mode === 'demo') {
          // The simulator needs a persona secret, so resolve whatever id we were
          // handed — a persona id, a participant id from a request, or nothing —
          // back to the persona that acts for this role.
          engineRef.current!.register(demoPersonaFor(role, partyId, demoPharmacy));
          return undefined;
        }
        const session = await ensureLive();
        if (role === 'regulator') throw new Error('The regulator is sealed in the constructor.');
        return session.register(role, partyId ?? identity.participantId);
      }),
    [mode, run, demoPharmacy, ensureLive, identity.participantId],
  );

  const revoke = useCallback(
    (partyId: string) =>
      run(`Revoke ${labelFor(partyId)}`, async () => {
        if (mode === 'demo') {
          engineRef.current!.revoke(partyId);
          return undefined;
        }
        return (await ensureLive()).revoke(partyId);
      }),
    [mode, run, ensureLive],
  );

  const reRegister = useCallback(
    (partyId: string) =>
      run(`Restore ${labelFor(partyId)}`, async () => {
        if (mode === 'demo') {
          engineRef.current!.reRegister(partyId);
          return undefined;
        }
        const session = await ensureLive();
        const role = PERSONAS[partyId]?.role;
        if (!role || role === 'regulator') throw new Error('Nothing to restore.');
        return session.register(role, partyId);
      }),
    [mode, run, ensureLive],
  );

  const createBatch = useCallback(
    (batchId: string, codes: string[], expiryDays: number, metadata: string) =>
      run(`Create batch ${batchId}`, async () => {
        if (mode === 'demo') {
          engineRef.current!.createBatch(batchId, 'acme', codes, expiryDays, metadata);
          return undefined;
        }
        const session = await ensureLive();
        return session.createBatch(batchId, codes, expiryDays, metadata);
      }),
    [mode, run, ensureLive],
  );

  const recordImport = useCallback(
    (batchId: string, terms: string) =>
      run(`Record import ${batchId}`, async () => {
        if (mode === 'demo') {
          engineRef.current!.recordImport(batchId, 'globalmed', terms);
          return undefined;
        }
        return (await ensureLive()).recordImport(batchId, terms);
      }),
    [mode, run, ensureLive],
  );

  const recall = useCallback(
    (batchId: string) =>
      run(`Recall batch ${batchId}`, async () => {
        if (mode === 'demo') {
          engineRef.current!.recall(batchId);
          return undefined;
        }
        return (await ensureLive()).recall(batchId);
      }),
    [mode, run, ensureLive],
  );

  const scan = useCallback(
    async (batchId: string, unitCode: string, dispense: boolean): Promise<ScanResult | null> => {
      const label = dispense ? `Dispense ${unitCode}` : `Verify ${unitCode}`;
      setBusy(label);
      setStage(mode === 'live' ? 'building' : 'proving');
      try {
        const result =
          mode === 'demo'
            ? dispense
              ? engineRef.current!.dispense(demoPharmacy, batchId, unitCode)
              : engineRef.current!.verify(demoPharmacy, batchId, unitCode)
            : dispense
              ? await (await ensureLive()).dispense(batchId, unitCode)
              : await (await ensureLive()).verify(batchId, unitCode);
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
    [mode, demoPharmacy, ensureLive, log, refresh],
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

  const regenerate = useCallback(() => {
    const next = regenerateIdentity();
    setIdentity(next);
    log('info', 'New app identity', bytesToHex(identityKeyBytes(next)).slice(0, 16) + '…');
  }, [log]);

  const batches = useMemo(() => ledger?.batches ?? [], [ledger]);

  return {
    ready,
    mode,
    setMode,
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
    ledger,
    refresh,
    batches,
    enrolment,
    actingPartyId,
    refreshEnrolment,
    pendingRequests,
    requestEnrolment,
    dismissRequest,
    busy,
    stage,
    activity,
    clearActivity: () => setActivity([]),
    demoPharmacy,
    setDemoPharmacy,
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

function labelFor(id: string): string {
  return PERSONAS[id]?.label ?? id.slice(0, 8);
}

/** The demo persona that acts for a role. Demo mode is the only place a
 *  role-to-actor mapping exists; live mode uses the app identity. */
export function demoActorFor(role: Role, demoPharmacy: string): string {
  if (role === 'regulator') return 'regulator';
  if (role === 'manufacturer') return 'acme';
  if (role === 'importer') return 'globalmed';
  return demoPharmacy;
}

/**
 * Resolve an enrolment target back to a persona the demo simulator can sign as.
 * The caller may hand us a persona id, a participant id from a request string,
 * or nothing at all; all three must land on a real persona.
 */
export function demoPersonaFor(role: Role, partyId: string | undefined, demoPharmacy: string): string {
  if (partyId) {
    if (PERSONAS[partyId]) return partyId;
    const match = Object.values(PERSONAS).find((p) => p.participantId === partyId);
    if (match) return match.id;
  }
  return demoActorFor(role, demoPharmacy);
}
