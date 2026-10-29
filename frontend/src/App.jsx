import React, { useState, useEffect } from 'react';
import LoginView from './views/LoginView';
import CashierView from './views/CashierView';
import AdminView from './views/AdminView';
import Header from './components/Header';
import { API_BASE } from './utils/constants';
import { WifiOff, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cx, getPrintMode, setPrintMode } from './utils/helpers';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-neutral-100 p-6 text-neutral-900">
          <div className="w-full max-w-md border border-neutral-200 bg-white p-6">
            <h2 className="text-base font-bold text-red-700">Une erreur est survenue</h2>
            <p className="mt-2 text-xs font-mono text-neutral-500 break-words">
              {this.state.error?.message || 'Erreur inattendue'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); }}
              className="mt-4 rounded bg-[#b38059] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9e6d47]"
            >
              Recharger l'interface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeShop, setActiveShop] = useState(() => {
    try {
      return localStorage.getItem('pos_active_shop') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');
  const [serverOnline, setServerOnline] = useState(true);

  const [printStations, setPrintStations] = useState([]);
  const [printStationId, setPrintStationId] = useState(() => localStorage.getItem('pos_station_id_v2') || '');
  const [toast, setToast] = useState(null);

  const [cashierTab, setCashierTab] = useState(() => {
    try {
      return localStorage.getItem('pos_cashier_tab_v1') || 'sale';
    } catch {
      return 'sale';
    }
  });

  const [printMode, setPrintModeState] = useState(() => getPrintMode());

  const [currentView, setCurrentView] = useState(() => {
    try {
      const savedUser = localStorage.getItem('pos_user');
      const savedView = localStorage.getItem('pos_view');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        return u.role === 'CASHIER' ? 'cashier' : 'admin';
      }
      return 'login';
    } catch {
      return 'login';
    }
  });

  const roleView = currentUser ? (currentUser.role === 'CASHIER' ? 'cashier' : 'admin') : currentView;

  useEffect(() => {
    if (currentUser) {
      setCurrentView(currentUser.role === 'CASHIER' ? 'cashier' : 'admin');
    }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (currentUser?.shopType && currentUser.shopType !== 'ALL') {
      setActiveShop(currentUser.shopType);
    }
  }, [currentUser?.id, currentUser?.shopType]);

  useEffect(() => {
    localStorage.setItem('pos_active_shop', activeShop);
  }, [activeShop]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('pos_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('pos_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('pos_cashier_tab_v1', cashierTab);
  }, [cashierTab]);

  useEffect(() => {
    if (currentView && currentView !== 'login') {
      localStorage.setItem('pos_view', currentView);
    } else {
      localStorage.removeItem('pos_view');
    }
  }, [currentView]);

  useEffect(() => {
    localStorage.setItem('pos_station_id_v2', printStationId);
  }, [printStationId]);

  useEffect(() => {
    const handleToast = (e) => {
      const { message, type = 'success' } = e.detail || {};
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener('pos:toast', handleToast);
    return () => window.removeEventListener('pos:toast', handleToast);
  }, []);

  const checkServerConnection = async () => {
    try {
      const res = await fetch(`${API_BASE}/heartbeat`);
      setServerOnline(res.ok);
    } catch {
      setServerOnline(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch(`${API_BASE}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } else {
        setUsersError('Impossible de charger les utilisateurs');
      }
    } catch {
      setUsersError('Erreur de connexion au serveur');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      } else {
        setCategoriesError('Impossible de charger les prestations');
      }
    } catch {
      setCategoriesError('Erreur réseau');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchPrintStations = async () => {
    try {
      const res = await fetch(`${API_BASE}/print/stations`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPrintStations(data);
          if (data.length > 0 && !printStationId) {
            setPrintStationId(data[0].id);
          }
        }
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    checkServerConnection();
    fetchUsers();
    fetchCategories();
    fetchPrintStations();

    const interval = setInterval(checkServerConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
    setActiveShop('ALL');
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_view');
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col overflow-hidden bg-[#f9f5f0] text-neutral-900 antialiased select-none font-sans">
        {/* Offline Banner */}
        {!serverOnline && (
          <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Connexion au serveur POS interrompue. Vérifiez le câble réseau ou le serveur.</span>
          </div>
        )}

        {/* Global Toast Notification */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-3 border border-neutral-200 bg-white px-4 py-3 text-xs font-medium text-neutral-900">
            {toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-neutral-400 hover:text-neutral-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!currentUser ? (
          <main className="flex min-h-0 flex-1 items-center justify-center p-4">
            <LoginView
              users={users}
              serverOnline={serverOnline}
              usersLoading={usersLoading}
              usersError={usersError}
              onRetryUsers={fetchUsers}
              setCurrentUser={setCurrentUser}
              setCurrentView={setCurrentView}
            />
          </main>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Header
              currentUser={currentUser}
              serverOnline={serverOnline}
              currentView={roleView}
              onLogout={handleLogout}
              cashierTab={cashierTab}
              setCashierTab={setCashierTab}
              printStations={printStations}
              printStationId={printStationId}
              setPrintStationId={setPrintStationId}
              printMode={printMode}
              setPrintMode={setPrintModeState}
              activeShop={activeShop}
              setActiveShop={setActiveShop}
            />

            <main className="min-h-0 flex-1 overflow-hidden">
              {roleView === 'admin' ? (
                <AdminView
                  currentUser={currentUser}
                  users={users}
                  categories={
                    currentUser?.role === 'MANAGER' && ['HOMME', 'FEMME'].includes(currentUser?.shopType)
                      ? categories.filter((c) => c.shopType === 'ALL' || c.shopType === currentUser.shopType)
                      : categories
                  }
                  fetchUsers={fetchUsers}
                  fetchCategories={fetchCategories}
                  usersLoading={usersLoading}
                  usersError={usersError}
                  categoriesLoading={categoriesLoading}
                  categoriesError={categoriesError}
                />
              ) : (
                <CashierView
                  categories={
                    activeShop !== 'ALL'
                      ? categories.filter((c) => !c.shopType || c.shopType === 'ALL' || c.shopType === activeShop)
                      : currentUser?.shopType && currentUser.shopType !== 'ALL'
                        ? categories.filter((c) => !c.shopType || c.shopType === 'ALL' || c.shopType === currentUser.shopType)
                        : categories
                  }
                  categoriesLoading={categoriesLoading}
                  categoriesError={categoriesError}
                  onRetryCategories={fetchCategories}
                  currentUser={currentUser}
                  serverOnline={serverOnline}
                  activeTab={cashierTab}
                  printStationId={printStationId}
                  activeShop={activeShop}
                />
              )}
            </main>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}