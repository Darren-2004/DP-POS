import React, { useState, useEffect } from 'react';
import { BarChart2, DollarSign, CreditCard, Calendar, Receipt, Eye, Printer, X, Sparkles, Clock, ChevronDown, CheckCircle2 } from 'lucide-react';
import { formatFCFA, getTodayDateStr, cx, getPaymentMethodLabel, triggerPrint, isReservationInvoice } from '../utils/helpers';
import { API_BASE } from '../utils/constants';
import { EmptyState, ErrorState, LoadingState } from './DesignSystem';

export default function CashierStatsView({ currentUser }) {
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState(getTodayDateStr());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState('ALL'); // 'ALL' | 'DIRECT' | 'RESERVATIONS'

  const [invoices, setInvoices] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [onlyMyOps, setOnlyMyOps] = useState(currentUser?.role === 'CASHIER');

  useEffect(() => {
    if (currentUser?.id) {
      fetchStats();
      fetchDetails();
    }
  }, [currentUser?.id, period, customDate, onlyMyOps]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchStats();
      fetchDetails();
    };
    window.addEventListener('pos:dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('pos:dashboard-refresh', handleRefresh);
  }, [currentUser?.id, period, customDate, onlyMyOps]);

  const getDateParams = () => {
    const now = new Date();
    let startDateStr = '', endDateStr = '';
    if (period === 'today') {
      const todayStr = getTodayDateStr();
      startDateStr = todayStr;
      endDateStr = todayStr;
    } else if (period === 'custom') {
      startDateStr = customDate || getTodayDateStr();
      endDateStr = customDate || getTodayDateStr();
    } else if (period === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      startDateStr = getTodayDateStr(d);
      endDateStr = getTodayDateStr();
    } else if (period === 'all') {
      startDateStr = '';
      endDateStr = '';
    }
    return { startDateStr, endDateStr };
  };

  const { startDateStr, endDateStr } = getDateParams();

  const fetchStats = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      const cashierParam = onlyMyOps ? `cashierId=${currentUser.id}` : '';
      const dateParams = (startDateStr && endDateStr) ? `startDate=${startDateStr}&endDate=${endDateStr}` : '';
      const queryStr = [dateParams, cashierParam].filter(Boolean).join('&');
      const res = await fetch(`${API_BASE}/stats${queryStr ? '?' + queryStr : ''}`);
      if (res.ok) {
        const data = await res.json();
        const s = (startDateStr && endDateStr) ? (data.filtered || data.today) : (data.today || data.filtered);
        setStats(s);
      } else {
        setLoadError('Impossible de charger les statistiques de caisse.');
      }
    } catch (e) {
      console.error('Fetch cashier stats error:', e);
      setLoadError('Erreur réseau lors du chargement des statistiques.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async () => {
    if (!currentUser?.id) return;
    try {
      const cashierParam = onlyMyOps ? `cashierId=${currentUser.id}` : '';
      const dateParams = (startDateStr && endDateStr) ? `startDate=${startDateStr}&endDate=${endDateStr}` : '';
      const baseQuery = [dateParams, cashierParam].filter(Boolean).join('&');

      const [invRes, resRes] = await Promise.all([
        fetch(`${API_BASE}/invoices?${baseQuery}`),
        fetch(`${API_BASE}/reservations?${baseQuery}`)
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        const list = Array.isArray(invData) ? invData : invData.items || [];
        setInvoices(list);
      }
      if (resRes.ok) {
        const resData = await resRes.json();
        setReservations(Array.isArray(resData) ? resData : []);
      }
    } catch {
      // Ignore
    }
  };

  const directSalesInvoices = invoices.filter(inv => !isReservationInvoice(inv));
  const reservationInvoices = invoices.filter(inv => isReservationInvoice(inv));

  // Direct accurate calculation from invoices array to guarantee numbers are NEVER zero
  let calcCash = 0;
  let calcOnline = 0;
  let calcOrange = 0;
  let calcTotal = 0;
  let calcValidatedCount = 0;
  let calcCancelledCount = 0;

  invoices.forEach((inv) => {
    const isVal = String(inv.status || '').toUpperCase() === 'VALIDATED';
    if (isVal) {
      calcValidatedCount++;
      const amt = Number(inv.totalAmount) || 0;
      calcTotal += amt;
      const m = String(inv.paymentMethod || '').toUpperCase();
      if (m.startsWith('MULTIPLE:')) {
        m.slice('MULTIPLE:'.length).split(';').forEach((part) => {
          const [method, rawAmount] = part.split('=');
          const mn = String(method || '').trim().toUpperCase();
          const pAmt = Number(rawAmount) || 0;
          if (['ORANGE_MONEY', 'ORANGE', 'OM'].includes(mn)) calcOrange += pAmt;
          else if (['ONLINE', 'MOBILE_MONEY', 'MOMO', 'WAVE'].includes(mn)) calcOnline += pAmt;
          else calcCash += pAmt;
        });
      } else if (['ORANGE_MONEY', 'ORANGE', 'OM'].includes(m)) {
        calcOrange += amt;
      } else if (['ONLINE', 'MOBILE_MONEY', 'MOMO', 'WAVE'].includes(m)) {
        calcOnline += amt;
      } else {
        calcCash += amt;
      }
    } else {
      calcCancelledCount++;
    }
  });

  // Effective values: prioritizing calculated values from real loaded transactions, or stats response
  const totalInvoiced = calcTotal > 0 ? calcTotal : (stats?.total || stats?.totalSales || 0);
  const cashVal = calcCash > 0 ? calcCash : (stats?.cash ?? stats?.payments?.CASH ?? 0);
  const onlineVal = calcOnline > 0 ? calcOnline : (stats?.online ?? stats?.payments?.ONLINE ?? 0);
  const orangeVal = calcOrange > 0 ? calcOrange : (stats?.orangeMoney ?? stats?.payments?.ORANGE_MONEY ?? 0);
  const validatedCount = calcValidatedCount > 0 ? calcValidatedCount : (stats?.count || stats?.validatedCount || 0);
  const cancelledCount = calcCancelledCount > 0 ? calcCancelledCount : (stats?.cancelledCount || 0);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white p-4 space-y-4">
      {/* Top Filter Bar (No Gradient) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#faf7f2] p-3.5 rounded-xl border border-[#e8e2d8] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#b38059] text-white shadow-xs">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Rapport Journalier de Caisse</h2>
            <p className="text-xs text-neutral-500">Recettes, ventilations des paiements et tickets émis</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-neutral-200">
            <button
              onClick={() => setPeriod('today')}
              className={cx('px-3 py-1.5 rounded text-xs font-bold transition cursor-pointer', period === 'today' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900')}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={cx('px-3 py-1.5 rounded text-xs font-bold transition cursor-pointer', period === 'week' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900')}
            >
              Cette semaine
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={cx('px-3 py-1.5 rounded text-xs font-bold transition cursor-pointer', period === 'custom' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900')}
            >
              Autre date
            </button>
          </div>

          {period === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 font-medium outline-none focus:border-[#b38059]"
            />
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') && (
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition">
              <input
                type="checkbox"
                checked={!onlyMyOps}
                onChange={(e) => setOnlyMyOps(!e.target.checked)}
                className="rounded accent-[#b38059]"
              />
              <span>Toutes les caisses</span>
            </label>
          )}
        </div>
      </div>

      {loadError && <ErrorState title="Statistiques indisponibles" description={loadError} onRetry={fetchStats} />}

      {/* Solid Color KPI Cards (No Gradients) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        {/* Total Invoiced */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Total Encaissé</div>
          <div className="mt-1.5 text-2xl font-extrabold text-[#b38059] tabular-nums">{formatFCFA(totalInvoiced)}</div>
          <div className="mt-1 text-[11px] font-medium text-neutral-600">{validatedCount} prestation{validatedCount > 1 ? 's' : ''} validée{validatedCount > 1 ? 's' : ''}</div>
        </div>

        {/* Cash */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">Espèces (Liquide)</div>
          <div className="mt-1.5 text-2xl font-extrabold text-neutral-900 tabular-nums">{formatFCFA(cashVal)}</div>
          <div className="mt-1 text-[11px] font-medium text-emerald-700">Règlement en liquide</div>
        </div>

        {/* Mobile Money MTN/Wave */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">Mobile Money / Wave</div>
          <div className="mt-1.5 text-2xl font-extrabold text-neutral-900 tabular-nums">{formatFCFA(onlineVal)}</div>
          <div className="mt-1 text-[11px] font-medium text-indigo-700">Paiements Wave / MoMo</div>
        </div>

        {/* Orange Money */}
        <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-900">Orange Money</div>
          <div className="mt-1.5 text-2xl font-extrabold text-[#b38059] tabular-nums">{formatFCFA(orangeVal)}</div>
          <div className="mt-1 text-[11px] font-medium text-orange-700">Paiements Orange Money</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 shrink-0">
        <button
          onClick={() => setActiveFilterTab('ALL')}
          className={cx(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
            activeFilterTab === 'ALL' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
          )}
        >
          Tous les actes ({invoices.length})
        </button>
        <button
          onClick={() => setActiveFilterTab('DIRECT')}
          className={cx(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
            activeFilterTab === 'DIRECT' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
          )}
        >
          Ventes Directes ({directSalesInvoices.length})
        </button>
        <button
          onClick={() => setActiveFilterTab('RESERVATIONS')}
          className={cx(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
            activeFilterTab === 'RESERVATIONS' ? 'bg-[#b38059] text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
          )}
        >
          Rendez-vous ({reservations.length})
        </button>
      </div>

      {/* Table Section */}
      <div className="min-h-0 flex-1 overflow-hidden bg-white rounded-xl border border-neutral-200 shadow-xs flex flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeFilterTab !== 'RESERVATIONS' ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#faf7f2] text-[10px] uppercase tracking-wider text-neutral-600 font-bold border-b border-neutral-200 z-10">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Heure</th>
                  <th className="px-4 py-3">Règlement</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(activeFilterTab === 'DIRECT' ? directSalesInvoices : invoices).map((inv) => (
                  <tr key={inv.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#b38059]">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5 font-semibold text-neutral-900">{inv.clientName || 'Client de passage'}</td>
                    <td className="px-4 py-2.5 text-neutral-500 font-medium">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700 font-medium">{getPaymentMethodLabel(inv.paymentMethod)}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-right text-neutral-900">{formatFCFA(inv.totalAmount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cx(
                        'rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider border',
                        inv.status === 'VALIDATED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                      )}>
                        {inv.status === 'VALIDATED' ? 'Validé' : 'Annulé'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#faf7f2] text-[10px] uppercase tracking-wider text-neutral-600 font-bold border-b border-neutral-200 z-10">
                <tr>
                  <th className="px-4 py-3">Réf / Prestation</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Acompte</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {reservations.map((res) => {
                  const paid = (res.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
                  return (
                    <tr key={res.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-2.5">
                        <div className="font-mono font-bold text-[#b38059]">{res.reservationNo}</div>
                        <div className="text-[10px] text-neutral-500 font-medium">{res.serviceName || 'Prestation'}</div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-neutral-900">
                        <div>{res.clientName || 'Client'}</div>
                        {res.clientPhone && <div className="text-[10px] text-neutral-400 font-mono">{res.clientPhone}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cx(
                          'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border',
                          res.shopType === 'HOMME' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                        )}>
                          {res.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-right text-neutral-900">{formatFCFA(res.totalAmount)}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-right text-emerald-600">{formatFCFA(paid)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cx(
                          'rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider border',
                          res.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          res.status === 'CANCELLED' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                          'bg-amber-50 text-amber-800 border-amber-200'
                        )}>
                          {res.status === 'COMPLETED' ? 'Honorée' :
                           res.status === 'CANCELLED' ? 'Annulée' :
                           'En attente'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
