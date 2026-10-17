import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MedPassProvider } from './contexts/MedPassProvider';
import { AppShell } from './layout/AppShell';
import { RequireRole } from './components/RequireRole';
import { Landing } from './pages/Landing';
import { Overview } from './pages/Overview';
import { Register } from './pages/Register';
import { ManufacturerHome } from './pages/manufacturer/ManufacturerHome';
import { BatchDetail } from './pages/manufacturer/BatchDetail';
import { ImporterHome } from './pages/importer/ImporterHome';
import { PharmacyHome } from './pages/pharmacy/PharmacyHome';
import { ScanHistory } from './pages/pharmacy/ScanHistory';
import { RegulatorHome } from './pages/regulator/RegulatorHome';
import { PartyDetail } from './pages/regulator/PartyDetail';
import { BATCH_ROUTE, PARTY_ROUTE, ROUTES } from './lib/routes';

/**
 * HashRouter, not BrowserRouter: the app is served as static files from a
 * Vite preview and a Midnight contract host, neither of which rewrites deep
 * links to index.html. Hash routing keeps a refresh on any route working.
 */
export function App() {
  return (
    <MedPassProvider>
      <HashRouter>
        <Routes>
          <Route path={ROUTES.landing} element={<Landing />} />
          <Route element={<AppShell />}>
            <Route path={ROUTES.overview} element={<Overview />} />
            <Route path={ROUTES.register} element={<Register />} />
            <Route
              path={ROUTES.manufacturer}
              element={
                <RequireRole role="manufacturer">
                  <ManufacturerHome />
                </RequireRole>
              }
            />
            <Route
              path={BATCH_ROUTE}
              element={
                <RequireRole role="manufacturer">
                  <BatchDetail />
                </RequireRole>
              }
            />
            <Route
              path={ROUTES.importer}
              element={
                <RequireRole role="importer">
                  <ImporterHome />
                </RequireRole>
              }
            />
            <Route
              path={ROUTES.pharmacy}
              element={
                <RequireRole role="pharmacy">
                  <PharmacyHome />
                </RequireRole>
              }
            />
            <Route
              path={ROUTES.scanHistory}
              element={
                <RequireRole role="pharmacy">
                  <ScanHistory />
                </RequireRole>
              }
            />
            <Route path={ROUTES.regulator} element={<RegulatorHome />} />
            <Route path={PARTY_ROUTE} element={<PartyDetail />} />
            <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </MedPassProvider>
  );
}
