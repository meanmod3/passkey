import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { AppShell } from './components/AppShell';
import { IdentityPicker } from './components/IdentityPicker';
import { RecordsPage } from './pages/RecordsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AuditPage } from './pages/AuditPage';
import { TerminalPage } from './pages/TerminalPage';
import { SettingsPage } from './pages/SettingsPage';
import { api, ApiError } from './services/api';
import { useAuthStore } from './stores/auth.store';
import { useRightPanel } from './stores/rightPanel.store';

export default function App(): JSX.Element {
  const { token, user, setAuth, clearAuth } = useAuthStore();
  const [booting, setBooting] = useState(Boolean(token));

  useEffect(() => {
    if (!token) { setBooting(false); return; }
    void (async () => {
      try {
        const { user: fresh } = await api.me();
        setAuth(token, fresh);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clearAuth();
      } finally { setBooting(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }
  if (!user) return <IdentityPicker />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<RecordsPage />} />
        <Route path="/records" element={<Navigate to="/" replace />} />
        <Route path="/my-requests" element={<PanelRedirect mode="my-requests" />} />
        <Route path="/notifications" element={<PanelRedirect mode="notifications" />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

/**
 * Visiting /my-requests or /notifications directly redirects to the records
 * surface and opens the corresponding right-panel mode.
 */
function PanelRedirect({ mode }: { mode: 'my-requests' | 'notifications' }): JSX.Element {
  const { showMyRequests, showNotifications } = useRightPanel();
  useEffect(() => {
    if (mode === 'my-requests') showMyRequests();
    else showNotifications();
  }, [mode, showMyRequests, showNotifications]);
  return <Navigate to="/" replace />;
}
