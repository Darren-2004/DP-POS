import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3,
  Users as UsersIcon,
  Package,
  Scissors,
  Award,
  Store,
  FileText,
  Calendar,
  UserCheck,
  Printer,
  Settings,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { getTodayDateStr, cx } from '../utils/helpers';
import Dashboard from './admin/Dashboard';
import Users from './admin/Users';
import CategoriesView from './admin/Categories';
import ProductsPanel from './admin/ProductsPanel';
import CombinedReports from './admin/CombinedReports';
import InvoicesJournalPanel from './admin/InvoicesJournalPanel';
import ClientsPanel from './admin/ClientsPanel';
import ReservationsPanel from './admin/ReservationsPanel';
import DevicesPanel from './admin/DevicesPanel';
import SettingsPanel from './admin/SettingsPanel';
import { API_BASE } from '../utils/constants';

export default function AdminView({
  currentUser,
  users = [],
  categories = [],
  fetchUsers,
  fetchCategories,
  usersLoading,
  usersError,
  categoriesLoading,
  categoriesError,
}) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const assignedManagerShop = users.find((user) => user.id === currentUser?.id)?.shopType;
  const [adminTab, setAdminTab] = useState(isAdmin ? 'global' : 'dashboard');
  const [stats, setStats] = useState({ today: {}, week: {}, month: {} });

  const currentShopType = isManager
    ? (['HOMME', 'FEMME'].includes(assignedManagerShop) ? assignedManagerShop : currentUser.shopType)
    : adminTab === 'shop1'
    ? 'HOMME'
    : adminTab === 'shop2'
    ? 'FEMME'
    : null;

  const managerHasShop = ['HOMME', 'FEMME'].includes(currentShopType);
  const [invoices, setInvoices] = useState([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState({
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  });
  const [filterDate, setFilterDate] = useState(getTodayDateStr());
  const [filterCashier, setFilterCashier] = useState('');
  const [reservationPayments, setReservationPayments] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const refreshDashboardData = async (date = filterDate, cashierId = filterCashier, page = invoicePage) => {
    const fetchId = ++fetchIdRef.current;
    if (isManager && !['HOMME', 'FEMME'].includes(currentShopType)) {
      setStats({ today: {}, week: {}, month: {} });
      setInvoices([]);
      setReservationPayments([]);
      setReservations([]);
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      if (cashierId) params.append('cashierId', cashierId);
      if (currentShopType) params.append('shopType', currentShopType);

      const [statsRes, invsRes, resPayRes, resRes] = await Promise.all([
        fetch(`${API_BASE}/stats?${params.toString()}`),
        fetch(
          `${API_BASE}/invoices?${new URLSearchParams({
            ...Object.fromEntries(params),
            page: String(page),
            pageSize: '50',
          }).toString()}`
        ),
        fetch(`${API_BASE}/reservation-payments?${params.toString()}`),
        fetch(`${API_BASE}/reservations?${params.toString()}`),
      ]);

      if (fetchId !== fetchIdRef.current) return;

      if (statsRes && statsRes.ok) {
        const data = await statsRes.json();
        if (data && typeof data === 'object') setStats(data);
      }
      if (invsRes && invsRes.ok) {
        const responseData = await invsRes.json();
        let data = Array.isArray(responseData) ? responseData : responseData.items;
        if (Array.isArray(data) && currentShopType) {
          data = data.filter((invoice) => (invoice.shopType || 'FEMME') === currentShopType);
        }
        setInvoices(Array.isArray(data) ? data : []);
        if (!Array.isArray(responseData)) {
          setInvoicePagination({
            total: Number(responseData.total) || 0,
            page: Number(responseData.page) || page,
            pageSize: Number(responseData.pageSize) || 50,
            totalPages: Number(responseData.totalPages) || 0,
          });
        }
      }
      if (resPayRes && resPayRes.ok) {
        let data = await resPayRes.json();
        if (Array.isArray(data) && currentShopType) {
          data = data.filter((payment) => (payment.shopType || 'FEMME') === currentShopType);
        }
        setReservationPayments(Array.isArray(data) ? data : []);
      }
      if (resRes && resRes.ok) {
        let data = await resRes.json();
        if (Array.isArray(data) && currentShopType) {
          data = data.filter((reservation) => (reservation.shopType || 'FEMME') === currentShopType);
        }
        setReservations(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore
    } finally {
      if (fetchId === fetchIdRef.current) setDashboardLoading(false);
    }
  };

  const fetchInvoices = async (date = filterDate, cashierId = filterCashier, page = invoicePage) => {
    try {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      if (cashierId) params.append('cashierId', cashierId);
      if (currentShopType) params.append('shopType', currentShopType);
      params.append('page', String(page));
      params.append('pageSize', '50');
      const res = await fetch(`${API_BASE}/invoices?${params.toString()}`);
      if (res.ok) {
        const responseData = await res.json();
        const data = Array.isArray(responseData) ? responseData : responseData.items;
        setInvoices(
          Array.isArray(data) && currentShopType
            ? data.filter((invoice) => (invoice.shopType || 'FEMME') === currentShopType)
            : Array.isArray(data)
            ? data
            : []
        );
        if (!Array.isArray(responseData)) setInvoicePagination(responseData);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    refreshDashboardData(filterDate, filterCashier, invoicePage);
  }, [filterDate, filterCashier, adminTab, currentShopType, invoicePage]);

  // Sidebar navigation sections
  const navigationSections = isAdmin
    ? [
        {
          title: 'PILOTAGE DU RÉSEAU',
          items: [
            { id: 'global', label: 'Vue Réseau Consolidée', icon: <TrendingUp className="h-4 w-4" /> },
            { id: 'shop1', label: 'Shop 1 (Homme)', icon: <Store className="h-4 w-4" /> },
            { id: 'shop2', label: 'Shop 2 (Femme)', icon: <Store className="h-4 w-4" /> },
          ],
        },
        {
          title: 'FINANCES & COMPTABILITÉ',
          items: [
            { id: 'invoices', label: 'Journal des Factures', icon: <FileText className="h-4 w-4" /> },
            { id: 'reports', label: 'Clôtures & Rapports Z', icon: <Award className="h-4 w-4" /> },
          ],
        },
        {
          title: 'CATALOGUE & STOCK',
          items: [
            { id: 'categories', label: 'Prestations & Tarifs', icon: <Scissors className="h-4 w-4" /> },
            { id: 'products', label: 'Stock & Mèches', icon: <Package className="h-4 w-4" /> },
          ],
        },
        {
          title: 'ACTIVITÉ DU SALON',
          items: [
            { id: 'reservations', label: 'Réservations & Planning', icon: <Calendar className="h-4 w-4" /> },
            { id: 'clients', label: 'Fichier Clients & Fidélité', icon: <UserCheck className="h-4 w-4" /> },
          ],
        },
        {
          title: 'ADMINISTRATION',
          items: [
            { id: 'staff', label: 'Équipe & Gérants', icon: <UsersIcon className="h-4 w-4" /> },
            { id: 'devices', label: 'Imprimantes & Caisses', icon: <Printer className="h-4 w-4" /> },
            { id: 'settings', label: 'Paramètres & Sauvegardes', icon: <Settings className="h-4 w-4" /> },
          ],
        },
      ]
    : [
        {
          title: 'TABLEAU DE BORD',
          items: [
            { id: 'dashboard', label: 'Statistiques & Ventes', icon: <BarChart3 className="h-4 w-4" /> },
          ],
        },
        {
          title: 'FINANCES & TICKETS',
          items: [
            { id: 'invoices', label: 'Journal des Tickets', icon: <FileText className="h-4 w-4" /> },
            { id: 'reports', label: 'Rapports de Clôture', icon: <Award className="h-4 w-4" /> },
          ],
        },
        {
          title: 'CATALOGUE & STOCK',
          items: [
            { id: 'categories', label: 'Prestations & Tarifs', icon: <Scissors className="h-4 w-4" /> },
            { id: 'products', label: 'Stock & Mèches', icon: <Package className="h-4 w-4" /> },
          ],
        },
        {
          title: 'ACTIVITÉ',
          items: [
            { id: 'reservations', label: 'Réservations', icon: <Calendar className="h-4 w-4" /> },
            { id: 'clients', label: 'Clients', icon: <UserCheck className="h-4 w-4" /> },
          ],
        },
        {
          title: 'GESTION DU SHOP',
          items: [
            { id: 'users', label: 'Équipe Caissiers', icon: <UsersIcon className="h-4 w-4" /> },
            { id: 'devices', label: 'Imprimantes', icon: <Printer className="h-4 w-4" /> },
          ],
        },
      ];

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      {/* Light Warm Solid Sidebar (No Gradients, Matches White Background) */}
      <aside className="w-64 shrink-0 bg-[#faf8f5] text-neutral-800 border-r border-[#e8e2d8] p-4 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-5">
          {/* Brand Header Card */}
          <div className="rounded-xl border border-[#e8e2d8] bg-white p-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b38059] text-white shadow-xs">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-neutral-900 tracking-wide">JOEL SHOP</h2>
                <p className="text-[10px] text-[#b38059] font-bold uppercase tracking-wider">
                  {isAdmin ? 'Console Direction' : 'Gestion Salon'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Sections */}
          {navigationSections.map((sec, secIdx) => (
            <div key={secIdx}>
              <p className="px-2 text-[10px] font-extrabold uppercase tracking-widest text-[#9c6a41] mb-1.5">
                {sec.title}
              </p>
              <nav className="space-y-0.5">
                {sec.items.map((tab) => {
                  const isActive = adminTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setInvoicePage(1);
                        setAdminTab(tab.id);
                      }}
                      className={cx(
                        'group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition text-left cursor-pointer',
                        isActive
                          ? 'bg-[#b38059] text-white shadow-xs font-bold'
                          : 'text-neutral-700 hover:bg-[#ede6dd] hover:text-neutral-900'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={
                            isActive
                              ? 'text-white'
                              : 'text-[#b38059] group-hover:text-[#9e6d47] transition-colors'
                          }
                        >
                          {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                      </div>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 text-white" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer info badge */}
        <div className="mt-6 pt-3 border-t border-[#e8e2d8] text-xs">
          <div className="rounded-xl bg-white border border-[#e8e2d8] p-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900 text-xs">Réseau Joel Shop</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                En ligne
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500 font-medium">Shop 1 (Homme) & Shop 2 (Femme)</p>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-white p-6">
        {/* Analytics / Dashboard View */}
        {(adminTab === 'dashboard' || adminTab === 'global' || adminTab === 'shop1' || adminTab === 'shop2') && (
          <Dashboard
            stats={stats}
            invoices={invoices}
            reservationPayments={reservationPayments}
            reservations={reservations}
            users={isManager ? users.filter((u) => u.shopType === currentShopType && u.role === 'CASHIER') : users}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterCashier={filterCashier}
            setFilterCashier={setFilterCashier}
            fetchInvoices={fetchInvoices}
            loading={dashboardLoading}
            shopType={currentShopType}
            onScopeChange={(scope) => {
              if (scope === 'global') setAdminTab('global');
              else if (scope === 'shop1') setAdminTab('shop1');
              else if (scope === 'shop2') setAdminTab('shop2');
            }}
          />
        )}

        {/* Invoices & Sales Journal */}
        {adminTab === 'invoices' && (
          <InvoicesJournalPanel
            invoices={invoices}
            invoicePagination={invoicePagination}
            invoicePage={invoicePage}
            setInvoicePage={setInvoicePage}
            fetchInvoices={fetchInvoices}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            users={users}
            shopType={currentShopType}
            currentUser={currentUser}
          />
        )}

        {/* Reports & Z-Reports */}
        {adminTab === 'reports' && (!isManager || managerHasShop) && (
          <CombinedReports shopType={isManager ? currentShopType : currentShopType} />
        )}

        {/* Services & Categories */}
        {adminTab === 'categories' && (
          <CategoriesView
            categories={categories}
            fetchCategories={fetchCategories}
            loading={categoriesLoading}
            error={categoriesError}
            isManager={isManager}
            managerShopType={currentShopType}
          />
        )}

        {/* Stock & Products */}
        {adminTab === 'products' && (
          <ProductsPanel currentUser={currentUser} />
        )}

        {/* Reservations & Appointments */}
        {adminTab === 'reservations' && (
          <ReservationsPanel
            reservations={reservations}
            loading={dashboardLoading}
            users={users}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterCashier={filterCashier}
            setFilterCashier={setFilterCashier}
            selectedReservationId={selectedReservationId}
            setSelectedReservationId={setSelectedReservationId}
            onRefresh={() => refreshDashboardData(filterDate, filterCashier, invoicePage)}
            shopType={currentShopType}
          />
        )}


        {/* Clients & CRM */}
        {adminTab === 'clients' && (
          <ClientsPanel />
        )}

        {/* Users (Cashiers) */}
        {adminTab === 'users' && (
          <Users
            users={users.filter((user) => user.shopType === currentShopType && user.role === 'CASHIER')}
            currentUser={currentUser}
            isManager={isManager}
            managerShopType={currentShopType}
            fetchUsers={fetchUsers}
            loading={usersLoading}
            error={usersError}
          />
        )}

        {/* Staff & Managers */}
        {adminTab === 'staff' && (
          <Users
            users={users.filter((user) => user.role === 'MANAGER')}
            currentUser={currentUser}
            managerOnly
            fetchUsers={fetchUsers}
            loading={usersLoading}
            error={usersError}
          />
        )}

        {/* Printers & Devices */}
        {adminTab === 'devices' && (
          <DevicesPanel />
        )}

        {/* Settings & Backups */}
        {adminTab === 'settings' && (
          <SettingsPanel currentUser={currentUser} />
        )}
      </main>
    </div>
  );
}
