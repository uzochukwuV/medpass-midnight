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

  busy: string | null;
  stage: TxStage;
  activity: Activity[];
  clearActivity: () => void;

  demoPharmacy: string;
  setDemoPharmacy: (id: string) => void;

  lastScan: ScanResult | null;

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
  const [activity, setActivity] = useState<Activity[]>([]);
  const [demoPharmacy, setDemoPharmacy] = useState('citycare');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [contractAddress, setContractAddress] = useState(DEPLOYED_ADDRESS);

  const engineRef = useRef<DemoEngine | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const walletRef = useRef<ConnectedWallet | null>(null);

  const log = useCallback((kind: ActivityKind, title: string, detail?: string, txId?: string) => {
    setActivity((prev) => [{ id: nextId(), at: Date.now(), kind, title, detail, txId }, ...prev].slice(0, 60));
  }, []);

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
        refreshBalances();
      } catch (e) {
        setStage('failed');
        log('error', `${label} failed`, e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        setTimeout(() => setStage(IDLE_STAGE), 1500);
      }
    },
    [log, refresh, refreshBalances, mode],
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

  const demoActor = useCallback(
    (role: Role): string => {
      if (role === 'regulator') return 'regulator';
      if (role === 'manufacturer') return 'acme';
      if (role === 'importer') return 'globalmed';
      return demoPharmacy;
    },
    [demoPharmacy],
  );

  const register = useCallback(
    (role: Role, partyId?: string) =>
      run(`Register ${role}`, async () => {
        if (mode === 'demo') {
          const id = partyId ?? demoActor(role);
          engineRef.current!.register(id);
          return undefined;
        }
        const session = await ensureLive();
        if (role === 'regulator') throw new Error('The regulator is sealed in the constructor.');
        return session.register(role, partyId ?? identity.participantId);
      }),
    [mode, run, demoActor, ensureLive, identity.participantId],
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
    busy,
    stage,
    activity,
    clearActivity: () => setActivity([]),
    demoPharmacy,
    setDemoPharmacy,
    lastScan,
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
