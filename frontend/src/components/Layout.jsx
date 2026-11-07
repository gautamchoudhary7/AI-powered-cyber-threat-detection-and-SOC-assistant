import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bot, ListChecks, ClipboardList, FileText, LayoutDashboard, LogOut, Settings, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" aria-hidden="true" />
            <span className="font-semibold">SOC Assistant</span>
          </div>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
            </NavLink>
            <NavLink to="/upload" className={linkClass}>
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload CSV
            </NavLink>
            <NavLink to="/alerts" className={linkClass}>
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Alerts
            </NavLink>
            <NavLink to="/incidents" className={linkClass}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" /> Incidents
            </NavLink>
            <NavLink to="/assistant" className={linkClass}>
              <Bot className="h-4 w-4" aria-hidden="true" /> Assistant
            </NavLink>
            <NavLink to="/agent" className={linkClass}>
              <ListChecks className="h-4 w-4" aria-hidden="true" /> Suggestions
            </NavLink>
            <NavLink to="/reports" className={linkClass}>
              <FileText className="h-4 w-4" aria-hidden="true" /> Reports
            </NavLink>
            <NavLink to="/status" className={linkClass}>
              <Activity className="h-4 w-4" aria-hidden="true" /> System status
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-300">
              {user?.name} <span className="text-slate-500">({user?.role})</span>
            </span>
            <NavLink to="/settings" className={linkClass}>
              <Settings className="h-4 w-4" aria-hidden="true" /> Settings
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
