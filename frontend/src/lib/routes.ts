/** Every route in one place, so links never drift from the router table. */

export const ROUTES = {
  landing: '/',
  overview: '/app/overview',
  register: '/app/register',
  manufacturer: '/app/manufacturer',
  batch: (batchId: string) => `/app/manufacturer/batches/${encodeURIComponent(batchId)}`,
  importer: '/app/importer',
  pharmacy: '/app/pharmacy',
  scanHistory: '/app/pharmacy/history',
  regulator: '/app/regulator',
  party: (partyId: string) => `/app/regulator/parties/${encodeURIComponent(partyId)}`,
} as const;

export const BATCH_ROUTE = '/app/manufacturer/batches/:batchId';
export const PARTY_ROUTE = '/app/regulator/parties/:partyId';

export interface NavItem {
  to: string;
  label: string;
  step?: number;
}

/** Roles in dependency order — the order is the point, so it is stated once. */
export const ROLE_NAV: NavItem[] = [
  { to: ROUTES.regulator, label: 'Regulator', step: 1 },
  { to: ROUTES.manufacturer, label: 'Manufacturer', step: 2 },
  { to: ROUTES.importer, label: 'Importer', step: 3 },
  { to: ROUTES.pharmacy, label: 'Pharmacy', step: 4 },
];
