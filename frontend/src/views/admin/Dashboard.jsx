import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  Banknote,
  Smartphone,
  Calendar,
  Users,
  ShoppingBag,
  Scissors,
  Printer,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, LoadingState } from '../../components/DesignSystem';
import { apiFetch, formatFCFA, getTodayDateStr } from '../../utils/helpers';
import DualLineChart from '../../components/charts/DualLineChart';
import DonutChart from '../../components/charts/DonutChart';
import HorizontalBarChart from '../../components/charts/HorizontalBarChart';
import DateRangeFilter from '../../components/DateRangeFilter';
import { useShopNames } from '../../components/ShopNamesContext';
import { API_BASE } from '../../utils/constants';

export default function Dashboard({
  stats = {},
  invoices = [],
  reservationPayments = [],
  reservations = [],
  users = [],
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  filterCashier,
  setFilterCashier,
  loading = false,
  shopType = null,
  userRole = '',
  onScopeChange,
  serviceProviders = [],
  providerId = '',
  setProviderId,
  providerFilterError = '',
}) {
  const { shopNames } = useShopNames();
  const [comparisonPeriod, setComparisonPeriod] = useState('months'); // 'months' or 'week'
  const [providerRankingStats, setProviderRankingStats] = useState(null);
  const [providerRankingLoading, setProviderRankingLoading] = useState(false);
  const [providerRankingError, setProviderRankingError] = useState('');
  const [providerRankingRefresh, setProviderRankingRefresh] = useState(0);
  const [dashboardInsights, setDashboardInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [insightsRefresh, setInsightsRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    if (!['ADMIN', 'MANAGER'].includes(userRole)) return undefined;

    const fetchInsights = async () => {
      setInsightsLoading(true);
      setInsightsError('');
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
      if (shopType) params.set('shopType', shopType);
      try {
        const response = await apiFetch(`${API_BASE}/dashboard-insights?${params.toString()}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Réponse inattendue du serveur (HTTP ${response.status}).`);
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.error || `Erreur serveur (HTTP ${response.status}).`);
        }
        if (active) setDashboardInsights(data);
      } catch (error) {
        if (active) setInsightsError(error.message || 'Impossible de charger les indicateurs du tableau de bord.');
      } finally {
        if (active) setInsightsLoading(false);
      }
    };

    fetchInsights();
    return () => {
      active = false;
    };
  }, [startDate, endDate, shopType, userRole, insightsRefresh]);

  useEffect(() => {
    let active = true;
    if (!setProviderId || providerId) {
      setProviderRankingLoading(false);
      setProviderRankingError('');
      return undefined;
    }

    const fetchProviderRankings = async () => {
      setProviderRankingLoading(true);
      setProviderRankingError('');
      const params = new URLSearchParams();
      if (shopType) params.set('shopType', shopType);
      try {
        const response = await apiFetch(`${API_BASE}/service-provider-stats?${params.toString()}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Réponse inattendue du serveur (HTTP ${response.status}).`);
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.error || `Erreur serveur (HTTP ${response.status}).`);
        }
        if (active) setProviderRankingStats(data);
      } catch (error) {
        if (active) {
          setProviderRankingError(error.message || 'Impossible de charger les classements des prestataires.');
        }
      } finally {
        if (active) setProviderRankingLoading(false);
      }
    };

    fetchProviderRankings();
    return () => {
      active = false;
    };
  }, [providerId, providerRankingRefresh, setProviderId, shopType]);

  const isAllDates = !startDate || !endDate;
  const periodLabel = isAllDates ? 'toutes les dates' : startDate === endDate ? `du ${startDate}` : `du ${startDate} au ${endDate}`;
  const activeShopLabel =
    shopType === 'HOMME' ? shopNames.HOMME : shopType === 'FEMME' ? shopNames.FEMME : `Tous les shops (Réseau)`;

  const analytics = stats?.analytics || {};
  const growthPercentage = stats?.growthPercentage;
  const yesterdayTotal = stats?.yesterday?.total ?? 0;

  // Invoices filtered by active shop
  const safeInvoices = (Array.isArray(invoices) ? invoices : []).filter(
    (inv) => !shopType || (inv.shopType || 'FEMME') === shopType
  );
  const validatedInvoices = safeInvoices.filter((inv) => String(inv.status || '').toUpperCase() === 'VALIDATED');

  // Compute total sales directly or from backend
  const totalRev =
    analytics?.paymentBreakdown?.total ??
    validatedInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);

  const totalTickets = analytics?.ratios?.totalTickets ?? validatedInvoices.length;

  // Shop revenue calculation for the Pie Chart (Shop 1 vs Shop 2)
  const allValidated = (Array.isArray(invoices) ? invoices : []).filter(
    (inv) => String(inv.status || '').toUpperCase() === 'VALIDATED'
  );
  let shop1Revenue = 0;
  let shop2Revenue = 0;
  allValidated.forEach((inv) => {
    const amt = Number(inv.totalAmount) || 0;
    if (inv.shopType === 'HOMME') {
      shop1Revenue += amt;
    } else {
      shop2Revenue += amt;
    }
  });

  // Pie chart showing total revenue divided by each shop
  const shopPieData = [
    { label: shopNames.HOMME, value: shop1Revenue, color: '#b38059' },
    { label: shopNames.FEMME, value: shop2Revenue, color: '#2563eb' },
  ].filter((d) => d.value > 0);

  // Fallback if no revenue yet
  const effectiveShopPieData =
    shopPieData.length > 0
      ? shopPieData
      : [
          { label: shopNames.HOMME, value: 0, color: '#b38059' },
          { label: shopNames.FEMME, value: 0, color: '#2563eb' },
        ];

  // Dual Line Chart Comparative Data (Months vs Days of Current Week)
  const comparisonData = useMemo(() => {
    const allInvs = (Array.isArray(invoices) ? invoices : []).filter(
      (inv) => String(inv.status || '').toUpperCase() === 'VALIDATED'
    );

    if (comparisonPeriod === 'months') {
      // 12 Months of current year
      const months = [
        'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
        'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'
      ];
      const monthlyBuckets = months.map((name, idx) => ({
        label: name,
        fullLabel: `${name} ${new Date().getFullYear()}`,
        monthIndex: idx,
        shop1: 0,
        shop2: 0,
        total: 0,
      }));

      const currentYear = new Date().getFullYear();
      allInvs.forEach((inv) => {
        if (inv.createdAt) {
          const d = new Date(inv.createdAt);
          if (d.getFullYear() === currentYear) {
            const m = d.getMonth();
            const amt = Number(inv.totalAmount) || 0;
            if (monthlyBuckets[m]) {
              monthlyBuckets[m].total += amt;
              if (inv.shopType === 'HOMME') monthlyBuckets[m].shop1 += amt;
              else monthlyBuckets[m].shop2 += amt;
            }
          }
        }
      });
      return monthlyBuckets;
    } else {
      // 7 Days of current week (Monday to Sunday)
      const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + distanceToMonday);

      const weekBuckets = dayNames.map((name, idx) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + idx);
        const dateStr = d.toISOString().slice(0, 10);
        return {
          label: name,
          fullLabel: `${name} ${d.getDate()}/${d.getMonth() + 1}`,
          dateStr,
          shop1: 0,
          shop2: 0,
          total: 0,
        };
      });

      allInvs.forEach((inv) => {
        if (inv.createdAt) {
          const dStr = inv.createdAt.slice(0, 10);
          const bucket = weekBuckets.find((b) => b.dateStr === dStr);
          if (bucket) {
            const amt = Number(inv.totalAmount) || 0;
            bucket.total += amt;
            if (inv.shopType === 'HOMME') bucket.shop1 += amt;
            else bucket.shop2 += amt;
          }
        }
      });
      return weekBuckets;
    }
  }, [invoices, comparisonPeriod]);

  // Payment breakdown data
  const pb = analytics.paymentBreakdown || {};
  let cashTotal = pb.CASH;
  let orangeTotal = pb.ORANGE_MONEY;
  let onlineTotal = pb.ONLINE;

  if (cashTotal === undefined) {
    cashTotal = 0;
    orangeTotal = 0;
    onlineTotal = 0;
    validatedInvoices.forEach((inv) => {
      const amt = Number(inv.totalAmount) || 0;
      const m = String(inv.paymentMethod || '').toUpperCase();
      if (['ORANGE_MONEY', 'ORANGE', 'OM'].includes(m)) orangeTotal += amt;
      else if (['ONLINE', 'MOBILE_MONEY', 'MOMO', 'WAVE'].includes(m)) onlineTotal += amt;
      else cashTotal += amt;
    });
  }

  // Fallback category breakdown
  let categoryBreakdown = analytics.categoryBreakdown || [];
  if (categoryBreakdown.length === 0 && validatedInvoices.length > 0) {
    const catMap = {};
    validatedInvoices.forEach((inv) => {
      if (Array.isArray(inv.items)) {
        inv.items.forEach((item) => {
          const name = item.categoryName || 'Prestation';
          const price = Number(item.price) || 0;
          const qty = Number(item.qty) || 1;
          const tot = price * qty;
          if (!catMap[name]) catMap[name] = { name, quantity: 0, revenue: 0 };
          catMap[name].quantity += qty;
          catMap[name].revenue += tot;
        });
      }
    });
    categoryBreakdown = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);
  }

  const topServices = analytics.topServices || categoryBreakdown.slice(0, 10);
  const topProducts = analytics.topProducts || [];
  const ratios = analytics.ratios || {};
  const monthlyTrendData = (dashboardInsights?.monthlyTrends || []).map((month) => ({
    label: month.month,
    shop1: Number(month.shop1Revenue) || 0,
    shop2: Number(month.shop2Revenue) || 0,
    total: Number(month.total) || 0,
  }));
  const staffPerformance = dashboardInsights?.staffPerformance || [];
  const providerPerformance = dashboardInsights?.providerPerformance || [];
  const dailyOperations = dashboardInsights?.dailyOperations || {};
  const followUpClients = dashboardInsights?.followUpClients || [];
  const upcomingAppointments = dashboardInsights?.upcomingAppointments || [];
  return (
    <div className="space-y-6 bg-white pb-12">
      {/* Colored Header Banner (No Gradient) */}
      <div className="rounded-xl border border-[#e8dcd2] bg-[#faf6f2] p-5 shadow-2xs">
        <PageHeader
          eyebrow="PILOTAGE & PERFORMANCE COMMERCIALE"
          title={`Tableau de Bord – ${activeShopLabel}`}
          description={
            shopType
              ? `Indicateurs financiers et ventes de ${activeShopLabel}, ${periodLabel}.`
              : `Vue consolidée du réseau (${shopNames.HOMME} & ${shopNames.FEMME}) – Ventes, stock et palmarès, ${periodLabel}.`
          }
        />
      </div>

      {/* Filter Toolbar (No Gradient) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
            onPreset={(preset) => {
              const now = new Date();
              if (preset === 'today') {
                const today = getTodayDateStr(now);
                setStartDate(today);
                setEndDate(today);
              } else if (preset === 'week') {
                const monday = new Date(now);
                const day = monday.getDay();
                monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
                setStartDate(getTodayDateStr(monday));
                setEndDate(getTodayDateStr(now));
              } else if (preset === 'month') {
                setStartDate(getTodayDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
                setEndDate(getTodayDateStr(now));
              }
            }}
            onReset={() => {
              setStartDate('');
              setEndDate('');
            }}
            labels={{ today: 'Aujourd’hui', week: 'Cette semaine', month: 'Ce mois-ci', reset: 'Toutes les dates' }}
            className="w-full"
          />

          {Array.isArray(users) && users.length > 0 && setFilterCashier && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <span className="font-semibold text-neutral-700">Opérateur :</span>
              <select
                value={filterCashier || ''}
                onChange={(e) => setFilterCashier(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 outline-none focus:border-[#b38059]"
              >
                <option value="">Tous les opérateurs</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {setProviderId && (
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-neutral-500" />
              <span className="font-semibold text-neutral-700">Prestataire :</span>
              <select
                value={providerId || ''}
                onChange={(event) => setProviderId(event.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 outline-none focus:border-[#b38059]"
              >
                <option value="">Tous les prestataires</option>
                {serviceProviders
                  .filter((provider) => !shopType || provider.shopType === shopType)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} — {provider.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}
                    </option>
                  ))}
              </select>
              {providerFilterError && <span className="text-[11px] text-rose-600">{providerFilterError}</span>}
            </div>
          )}
        </div>

        {onScopeChange && (
          <div className="flex items-center gap-1 rounded-lg bg-neutral-200 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => onScopeChange('global')}
              className={`rounded-md px-3 py-1 transition ${
                !shopType
                  ? 'bg-white font-bold text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Réseau Global
            </button>
            <button
              type="button"
              onClick={() => onScopeChange('shop1')}
              className={`rounded-md px-3 py-1 transition ${
                shopType === 'HOMME'
                  ? 'bg-[#b38059] font-bold text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {shopNames.HOMME}
            </button>
            <button
              type="button"
              onClick={() => onScopeChange('shop2')}
              className={`rounded-md px-3 py-1 transition ${
                shopType === 'FEMME'
                  ? 'bg-[#b38059] font-bold text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {shopNames.FEMME}
            </button>
          </div>
        )}
      </div>

      {loading && <LoadingState label="Actualisation des statistiques financières..." />}

      {/* Solid Color KPI Cards (No Gradients) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Chiffre d'Affaires with Yesterday Percentage Comparison */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Chiffre d'Affaires
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b38059] text-white shadow-xs">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <p className="mt-2 text-2xl font-extrabold tracking-tight text-[#b38059]">
            {formatFCFA(totalRev)}
          </p>

          {/* Yesterday evolution pill */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
            {growthPercentage !== undefined && growthPercentage !== null ? (
              growthPercentage > 0 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <ArrowUpRight className="h-3.5 w-3.5" /> +{growthPercentage}% vs hier
                </span>
              ) : growthPercentage < 0 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                  <ArrowDownRight className="h-3.5 w-3.5" /> {growthPercentage}% vs hier
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-700">
                  <Minus className="h-3.5 w-3.5" /> 0% vs hier
                </span>
              )
            ) : (
              <span className="text-[11px] text-neutral-600 font-medium">{totalTickets} tickets</span>
            )}
            <span className="text-[10px] text-neutral-500">
              (Hier : {formatFCFA(yesterdayTotal)})
            </span>
          </div>
        </div>

        {/* KPI 2: Factures réalisées */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
              Factures réalisées
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Printer className="h-4 w-4" />
            </div>
          </div>

          <p className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900">
            {totalTickets}
          </p>
          <p className="mt-2 text-xs text-indigo-700 font-medium">
            Factures validées sur la période
          </p>
        </div>

        {/* KPI 3: Espèces (Liquide) */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Espèces (Liquide)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <Banknote className="h-4 w-4" />
            </div>
          </div>

          <p className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900">
            {formatFCFA(cashTotal)}
          </p>
          <p className="mt-2 text-xs text-emerald-700 font-medium">
            {totalRev > 0 ? `${Math.round((cashTotal / totalRev) * 100)}% de la recette globale` : '0%'}
          </p>
        </div>

        {/* KPI 4: Mobile Money & Orange */}
        <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-900">
              Paiements Digitaux
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white shadow-xs">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>

          <p className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900">
            {formatFCFA(orangeTotal + onlineTotal)}
          </p>
          <p className="mt-2 text-[11px] text-neutral-600 font-medium">
            Orange: <span className="font-bold text-orange-700">{formatFCFA(orangeTotal)}</span> · Wave/MoMo:{' '}
            <span className="font-bold text-neutral-800">{formatFCFA(onlineTotal)}</span>
          </p>
        </div>
      </div>

      {/* Solid Sub-cards: Prestations, Stock, Réservations (No Gradients) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white shadow-2xs">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">Ventes Prestations</p>
              <p className="text-base font-bold text-neutral-900">
                {formatFCFA(ratios.serviceRevenue || totalRev)}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
            Services
          </span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Ventes Produits & Mèches</p>
              <p className="text-base font-bold text-neutral-900">
                {formatFCFA(ratios.productRevenue || 0)}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
            Stock
          </span>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5 flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-2xs">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-violet-900 uppercase tracking-wider">Réservations Prévues</p>
              <p className="text-base font-bold text-neutral-900">
                {Array.isArray(reservations) ? reservations.length : 0} rendez-vous
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-violet-800 bg-violet-100 px-2.5 py-0.5 rounded-full">
            {Array.isArray(reservationPayments) ? reservationPayments.length : 0} acomptes
          </span>
        </div>
      </div>

      {/* Row: Dual Line Chart (Shop 1 vs Shop 2 by Months or Weekdays) + Pie Chart (Total Revenue by Shop) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Comparative Dual Line Chart (2 Cols) */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Courbe Comparative : {shopNames.HOMME} vs {shopNames.FEMME}
              </h3>
              <p className="text-xs text-neutral-500">
                {shopNames.HOMME} en bronze et {shopNames.FEMME} en bleu
              </p>
            </div>

            {/* Toggle: By Months vs By Days of Current Week */}
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
              <button
                type="button"
                onClick={() => setComparisonPeriod('months')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  comparisonPeriod === 'months'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Par Mois
              </button>
              <button
                type="button"
                onClick={() => setComparisonPeriod('week')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  comparisonPeriod === 'week'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Jours de la Semaine
              </button>
            </div>
          </div>

          <DualLineChart
            data={comparisonData}
            height={260}
            series1Key="shop1"
            series2Key="shop2"
            series1Label={shopNames.HOMME}
            series2Label={shopNames.FEMME}
            series1Color="#b38059"
            series2Color="#2563eb"
            labelKey="label"
          />
        </div>

        {/* Pie / Donut Chart: Total Revenue Divided by Each Shop (1 Col) */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="border-b border-neutral-100 pb-3 mb-4">
            <h3 className="text-sm font-bold text-neutral-900">Répartition du CA par Shop</h3>
            <p className="text-xs text-neutral-500">Part de {shopNames.HOMME} vs {shopNames.FEMME}</p>
          </div>

          <DonutChart
            data={effectiveShopPieData}
            size={180}
            strokeWidth={24}
            centerTitle="Total Réseau"
          />
        </div>
      </div>

      {/* Bottom Row: Categories, Top Services, Top Products */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Category Breakdown */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">CA par Catégorie</h3>
              <p className="text-xs text-neutral-500">Pôles les plus rémunérateurs</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>

          <HorizontalBarChart
            data={categoryBreakdown}
            valueKey="revenue"
            quantityKey="quantity"
            labelKey="name"
            barColor="#6366f1"
            emptyMessage="Aucune catégorie facturée pour cette période"
          />
        </div>

        {/* Top 10 Services */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Top Prestations</h3>
              <p className="text-xs text-neutral-500">Services les plus demandés</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Scissors className="h-4 w-4" />
            </div>
          </div>

          <HorizontalBarChart
            data={topServices}
            valueKey="revenue"
            quantityKey="quantity"
            labelKey="name"
            barColor="#b38059"
            emptyMessage="Aucune prestation enregistrée pour cette période"
          />
        </div>

        {/* Top 10 Stock Products */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Top Produits & Mèches</h3>
              <p className="text-xs text-neutral-500">Articles les plus vendus</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>

          <HorizontalBarChart
            data={topProducts}
            valueKey="revenue"
            quantityKey="quantity"
            labelKey="name"
            barColor="#2563eb"
            emptyMessage="Aucun produit de stock vendu pour cette période"
          />
        </div>
      </div>

      {userRole === 'ADMIN' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Vue d’ensemble de l’équipe et tendances du réseau</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Activité de l’équipe sur {periodLabel}; évolution mensuelle du chiffre d’affaires de l’année en cours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInsightsRefresh((value) => value + 1)}
              disabled={insightsLoading}
              className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              Actualiser
            </button>
          </div>
          {insightsLoading ? (
            <LoadingState label="Chargement des tendances et performances de l’équipe..." rows={2} />
          ) : insightsError ? (
            <ErrorState
              title="Vue d’ensemble indisponible"
              description={insightsError}
              onRetry={() => setInsightsRefresh((value) => value + 1)}
            />
          ) : (
            <>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
                <h3 className="mb-1 text-xs font-bold text-neutral-900">Tendance mensuelle du chiffre d’affaires</h3>
                <p className="mb-4 text-xs text-neutral-500">{new Date().getFullYear()} — comparaison des deux salons</p>
                <DualLineChart
                  data={monthlyTrendData}
                  height={260}
                  series1Key="shop1"
                  series2Key="shop2"
                  series1Label={shopNames.HOMME}
                  series2Label={shopNames.FEMME}
                  series1Color="#b38059"
                  series2Color="#2563eb"
                  labelKey="label"
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <RankingTable
                  title="Équipe — ventes par caissier / gérant"
                  rows={staffPerformance}
                  shopNames={shopNames}
                  emptyMessage="Aucune vente validée sur cette période."
                />
                <RankingTable
                  title="Prestataires — prestations attribuées"
                  rows={providerPerformance}
                  shopNames={shopNames}
                  emptyMessage="Aucune prestation attribuée sur cette période."
                  providerRows
                />
              </div>
            </>
          )}
        </section>
      )}

      {userRole === 'MANAGER' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Opérations quotidiennes et suivi de votre équipe</h2>
            <p className="mt-1 text-xs text-neutral-500">{activeShopLabel} — activité du jour et suivi client.</p>
          </div>
          {insightsLoading ? (
            <LoadingState label="Chargement des opérations et du suivi client..." rows={2} />
          ) : insightsError ? (
            <ErrorState
              title="Données opérationnelles indisponibles"
              description={insightsError}
              onRetry={() => setInsightsRefresh((value) => value + 1)}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Ventes aujourd’hui" value={formatFCFA(dailyOperations.revenue)} />
                <MetricCard title="Tickets aujourd’hui" value={dailyOperations.invoiceCount || 0} />
                <MetricCard title="Rendez-vous aujourd’hui" value={dailyOperations.appointmentsToday || 0} />
                <MetricCard title="Rendez-vous à confirmer" value={dailyOperations.pendingAppointmentsToday || 0} />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <RankingTable
                  title="Performance des caissiers"
                  rows={staffPerformance}
                  shopNames={shopNames}
                  emptyMessage="Aucune vente validée sur cette période."
                />
                <RankingTable
                  title="Performance des prestataires"
                  rows={providerPerformance}
                  shopNames={shopNames}
                  emptyMessage="Aucune prestation attribuée sur cette période."
                  providerRows
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <FollowUpTable
                  title="Rendez-vous des 7 prochains jours"
                  rows={upcomingAppointments}
                  emptyMessage="Aucun rendez-vous prévu dans les 7 prochains jours."
                  appointmentRows
                />
                <FollowUpTable
                  title={`Clients à recontacter (sans visite depuis ${dashboardInsights?.followUpThresholdDays || 60} jours)`}
                  rows={followUpClients}
                  emptyMessage="Aucun client à recontacter pour le moment."
                />
              </div>
            </>
          )}
        </section>
      )}

      {!providerId && setProviderId && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Classement des prestataires</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Top 10 sur toutes les dates{shopType ? ` — ${shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}` : ' — tous les salons'}.
            </p>
          </div>

          {providerRankingLoading ? (
            <LoadingState label="Chargement des classements prestataires..." rows={2} />
          ) : providerRankingError ? (
            <ErrorState
              title="Classements prestataires indisponibles"
              description={providerRankingError}
              onRetry={() => setProviderRankingRefresh((value) => value + 1)}
            />
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              <ProviderRankingTable
                title="Top 10 — nombre de prestations réalisées"
                providers={providerRankingStats?.topByCount || []}
                shopNames={shopNames}
                metricLabel="Prestations"
                metric={(provider) => provider.serviceCount}
                formatMetric={(value) => `${value} prestation${value === 1 ? '' : 's'}`}
              />
              <ProviderRankingTable
                title="Top 10 — chiffre d’affaires attribué"
                providers={providerRankingStats?.topByRevenue || []}
                shopNames={shopNames}
                metricLabel="CA total"
                metric={(provider) => provider.revenue}
                formatMetric={formatFCFA}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MetricCard({ title, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

function RankingTable({ title, rows, shopNames, emptyMessage, providerRows = false }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
      <h3 className="border-b border-neutral-100 px-4 py-3 text-xs font-bold text-neutral-900">{title}</h3>
      {!rows.length ? (
        <EmptyState title="Aucune donnée" description={emptyMessage} className="min-h-28 border-0 py-4" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Nom</th>
                <th className="px-3 py-2.5">Salon</th>
                <th className="px-3 py-2.5 text-right">{providerRows ? 'Prestations' : 'Tickets'}</th>
                <th className="px-3 py-2.5 text-right">Chiffre d’affaires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.slice(0, 10).map((row) => (
                <tr key={`${row.id}-${row.shopType}`}>
                  <td className="px-3 py-2.5 font-semibold text-neutral-900">
                    {row.name}{!providerRows && row.role ? ` (${row.role === 'MANAGER' ? 'Gérant' : 'Caissier'})` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {row.shopType === 'HOMME' ? shopNames.HOMME : row.shopType === 'FEMME' ? shopNames.FEMME : 'Réseau'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">
                    {providerRows ? row.serviceCount : row.invoiceCount}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#b38059]">{formatFCFA(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FollowUpTable({ title, rows, emptyMessage, appointmentRows = false }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
      <h3 className="border-b border-neutral-100 px-4 py-3 text-xs font-bold text-neutral-900">{title}</h3>
      {!rows.length ? (
        <EmptyState title="Rien à signaler" description={emptyMessage} className="min-h-28 border-0 py-4" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Téléphone</th>
                <th className="px-3 py-2.5">{appointmentRows ? 'Rendez-vous' : 'Dernière visite'}</th>
                {appointmentRows && <th className="px-3 py-2.5">Prestation</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.slice(0, 20).map((row) => (
                <tr key={row.id || `${row.name}-${row.lastPurchaseAt}`}>
                  <td className="px-3 py-2.5 font-semibold text-neutral-900">{row.clientName || row.name}</td>
                  <td className="px-3 py-2.5 text-neutral-600">{row.clientPhone || row.phone || '—'}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {appointmentRows
                      ? new Date(row.scheduledAt || `${row.bookingDate || ''}T${row.bookingTime || '00:00'}`).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : `${row.daysSincePurchase} j`}
                  </td>
                  {appointmentRows && <td className="px-3 py-2.5 text-neutral-600">{row.serviceName || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProviderRankingTable({ title, providers, shopNames, metricLabel, metric, formatMetric }) {
  const topProviders = providers.slice(0, 10);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
      <h3 className="border-b border-neutral-100 px-4 py-3 text-xs font-bold text-neutral-900">{title}</h3>
      {topProviders.length === 0 ? (
        <EmptyState
          title="Aucune prestation attribuée"
          description="Les factures validées avec un prestataire apparaîtront ici."
          className="min-h-28 border-0 py-4"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Prestataire</th>
                <th className="px-3 py-2.5">Salon</th>
                <th className="px-3 py-2.5 text-right">{metricLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {topProviders.map((provider, index) => (
                <tr key={`${provider.id}-${provider.shopType}`}>
                  <td className="px-3 py-2.5 font-semibold text-neutral-400">{index + 1}</td>
                  <td className="px-3 py-2.5 font-semibold text-neutral-900">{provider.name}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {provider.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#b38059]">
                    {formatMetric(metric(provider))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
