import React from 'react';
import { Scissors, CalendarDays, Receipt, BarChart2, Printer, LogOut, CheckCircle2 } from 'lucide-react';
import { cx } from '../utils/helpers';

const CASHIER_TABS = [
  { key: 'sale', label: 'Caisse & Facturation', icon: Scissors },
  { key: 'reservations', label: 'Réservations & Calendrier', icon: CalendarDays },
  { key: 'my_invoices', label: 'Tickets du Jour', icon: Receipt },
  { key: 'stats', label: 'Rapport Journalier', icon: BarChart2 },
];

export default function Header({
  currentUser,
  serverOnline,
  currentView,
  onLogout,
  cashierTab,
  setCashierTab,
  printStations = [],
  printStationId,
  setPrintStationId,
  printMode,
  setPrintMode,
}) {
  const isCashier = currentUser?.role === 'CASHIER' && currentView === 'cashier';

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#9e6d47] bg-[#b38059] text-white px-4 sm:px-6 h-[58px] shrink-0 shadow-sm">
      {/* Brand & Shop Indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Scissors className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xs font-extrabold tracking-wide text-white leading-tight">
              Dimitri Perfect – Salon de Beauté
            </h1>
            <p className="text-[10px] text-white/80 font-medium">
              {currentView === 'admin' ? 'Direction & Administration' : 'Point d’Encaissement Caisse'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs for Cashier View */}
      {isCashier && (
        <nav className="hidden md:flex items-center gap-1">
          {CASHIER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = cashierTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCashierTab(tab.key)}
                className={cx(
                  'flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer',
                  isActive
                    ? 'bg-white text-[#b38059] shadow-xs'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Right Controls: Printer, User Info, Admin/Cashier Toggle, Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Printer Selector */}
        {printStations && printStations.length > 0 && setPrintStationId && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs text-white">
            <Printer className="h-3.5 w-3.5 text-white/80" />
            <select
              aria-label="Imprimante de cette caisse"
              value={printStationId}
              onChange={(e) => setPrintStationId(e.target.value)}
              className="bg-transparent text-xs text-white outline-none max-w-[130px] font-medium cursor-pointer"
            >
              <option value="" className="text-neutral-900 bg-white">Imprimante...</option>
              {printStations.map((st) => (
                <option key={st.id} value={st.id} className="text-neutral-900 bg-white">
                  {st.name} {st.online ? '✓' : '(Hors ligne)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Server Status Indicator */}
        {serverOnline ? (
          <div className="hidden xl:inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
            <span>En ligne</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">
            <span>Hors ligne</span>
          </div>
        )}

        {/* User Card & Logout */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-white/20">
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-xs font-bold text-white">{currentUser.name}</p>
            <p className="text-[10px] text-white/80">
              {currentUser.role === 'ADMIN' ? 'Administrateur' : currentUser.role === 'MANAGER' ? 'Gérant' : 'Caissier'}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Se déconnecter"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white hover:text-rose-600 transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
