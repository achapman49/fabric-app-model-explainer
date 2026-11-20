import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { NavGuard } from './components/common';
import { AboutPage } from './pages/AboutPage';
import { FieldGuidePage } from './pages/FieldGuidePage';
import { MissionBriefPage } from './pages/MissionBriefPage';
import { ProbesPage } from './pages/ProbesPage';
import { SpaceWeatherPage } from './pages/SpaceWeatherPage';
import { StarChartPage } from './pages/StarChartPage';
import { SystemPage } from './pages/SystemPage';
import { ModelProvider } from './state/ModelContext';

/** One shell for every route; the home route is the full-bleed sky. */
function Layout() {
  const { pathname } = useLocation();
  const home = pathname === '/';
  return (
    <ModelProvider>
      <NavGuard />
      <AppShell immersive={home} wide={!home}>
        <Outlet />
      </AppShell>
    </ModelProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SystemPage />} />
        <Route path="star-chart" element={<StarChartPage />} />
        <Route path="field-guide" element={<FieldGuidePage />} />
        <Route path="space-weather" element={<SpaceWeatherPage />} />
        <Route path="probes" element={<ProbesPage />} />
        <Route path="mission-brief" element={<MissionBriefPage />} />
        <Route path="about" element={<AboutPage />} />
        {/* Earlier routes keep working. */}
        <Route path="relationships" element={<Navigate to="/star-chart" replace />} />
        <Route path="tables" element={<Navigate to="/field-guide" replace />} />
        <Route path="measures" element={<Navigate to="/field-guide?tab=measures" replace />} />
        <Route path="health" element={<Navigate to="/space-weather" replace />} />
        <Route path="try" element={<Navigate to="/probes" replace />} />
        <Route path="one-pager" element={<Navigate to="/mission-brief" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
