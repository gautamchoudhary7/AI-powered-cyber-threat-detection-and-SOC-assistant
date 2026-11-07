import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import JobPage from './pages/JobPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import AlertDetailPage from './pages/AlertDetailPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import IncidentsPage from './pages/IncidentsPage.jsx';
import IncidentDetailPage from './pages/IncidentDetailPage.jsx';
import AssistantPage from './pages/AssistantPage.jsx';
import AgentPage from './pages/AgentPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ReportDetailPage from './pages/ReportDetailPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/jobs/:id" element={<JobPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/alerts/:id" element={<AlertDetailPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/status" element={<StatusPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
