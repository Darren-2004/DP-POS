import React, { useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';
import Button from '../../components/Button';
import { EmptyState, ErrorState } from '../../components/DesignSystem';
import DateRangeFilter from '../../components/DateRangeFilter';
import { apiFetch, formatFCFA, getTodayDateStr, showToast, triggerPrint } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';
import ZReport from './ZReport';
import ProductSalesReport from './ProductSalesReport';
import { useShopNames } from '../../components/ShopNamesContext';

export default function CombinedReports({ shopType = null }) {
  const { shopNames } = useShopNames();
  const today = getTodayDateStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [zReportData, setZReportData] = useState(null);
  const [salesReportData, setSalesReportData] = useState(null);
  const [providerStats, setProviderStats] = useState(null);
  const [zReportError, setZReportError] = useState('');
  const [salesReportError, setSalesReportError] = useState('');
  const [providerStatsError, setProviderStatsError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePreset = (type) => {
    const now = new Date();
    if (type === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (type === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      setStartDate(getTodayDateStr(start));
      setEndDate(today);
    } else if (type === 'month') {
      setStartDate(getTodayDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(today);
    }
  };

  const generateReports = async () => {
    setLoading(true);
    setZReportError('');
    setSalesReportError('');
    setProviderStatsError('');
    setZReportData(null);
    setSalesReportData(null);
    setProviderStats(null);
    const params = new URLSearchParams({ startDate, endDate });
    if (shopType) params.append('shopType', shopType);

    try {
      const [zResponse, salesResponse, providerStatsResponse] = await Promise.all([
        fetch(`${API_BASE}/z-report?${params.toString()}`),
        fetch(`${API_BASE}/product-sales-report?${params.toString()}`),
        apiFetch(`${API_BASE}/service-provider-stats?${params.toString()}`),
      ]);
      const [zResult, salesResult, providerStatsResult] = await Promise.all([
        zResponse.ok ? zResponse.json() : Promise.resolve(null),
        salesResponse.ok ? salesResponse.json() : Promise.resolve(null),
        providerStatsResponse.ok ? providerStatsResponse.json() : providerStatsResponse.json().catch(() => null),
      ]);

      if (zResponse.ok) setZReportData(zResult);
      else setZReportError('Erreur lors de la génération du rapport Z.');
      if (salesResponse.ok) setSalesReportData(salesResult);
      else setSalesReportError('Erreur lors de la génération du rapport détaillé.');
      if (providerStatsResponse.ok) setProviderStats(providerStatsResult);
      else setProviderStatsError(providerStatsResult?.error || 'Erreur lors du chargement des statistiques prestataires.');
      if (!zResponse.ok || !salesResponse.ok || !providerStatsResponse.ok) {
        showToast('Un ou plusieurs rapports n’ont pas pu être générés.', 'error');
      }
    } catch (error) {
      console.error(error);
      setZReportError('Erreur réseau lors de la génération du rapport Z.');
      setSalesReportError('Erreur réseau lors de la génération du rapport détaillé.');
      setProviderStatsError('Erreur réseau lors du chargement des statistiques prestataires.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="space-y-4 border-b border-neutral-200 pb-5">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Rapports comptable & ventes</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Consultez le rapport de clôture et le détail des ventes pour la même période.
          </p>
        </div>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          onPreset={handlePreset}
          onReset={() => {
            setStartDate(today);
            setEndDate(today);
          }}
        />
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={generateReports} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
            {loading ? 'Génération...' : 'Générer les rapports'}
          </Button>
        </div>
      </div>

      {loading && <p role="status" className="text-xs text-neutral-500">Génération des deux rapports...</p>}
      {!loading && !zReportData && !salesReportData && !zReportError && !salesReportError && (
        <p className="py-8 text-center text-xs text-neutral-500">Sélectionnez une période puis générez les rapports.</p>
      )}

      {(zReportData || zReportError) && (
        <section className="space-y-4 border-b border-neutral-200 pb-6">
          {zReportError ? (
            <ErrorState title="Rapport Z indisponible" description={zReportError} onRetry={generateReports} />
          ) : (
            <ZReport
              zReportData={zReportData}
              loading={false}
              showControls={false}
              onPrint={(data) => triggerPrint(data)}
            />
          )}
        </section>
      )}

      {(salesReportData || salesReportError) && (
        <section>
          <ProductSalesReport
            shopType={shopType}
            combinedMode
            combinedReportData={salesReportData}
            combinedStartDate={startDate}
            combinedEndDate={endDate}
            combinedLoading={false}
            combinedError={salesReportError}
          />
        </section>
      )}

      {(providerStats || providerStatsError) && (
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Performance des prestataires</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Classement selon le nombre de prestations attribuées et le chiffre d’affaires associé à la période.
            </p>
          </div>
          {providerStatsError ? (
            <ErrorState title="Statistiques prestataires indisponibles" description={providerStatsError} onRetry={generateReports} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { title: 'Prestations les plus réalisées', rows: providerStats.topByCount || [], metric: (row) => `${row.serviceCount} prestation${row.serviceCount > 1 ? 's' : ''}` },
                { title: 'Prestataires au meilleur chiffre d’affaires', rows: providerStats.topByRevenue || [], metric: (row) => formatFCFA(row.revenue) },
              ].map((ranking) => (
                <div key={ranking.title} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h4 className="mb-3 text-xs font-bold text-neutral-800">{ranking.title}</h4>
                  {ranking.rows.length ? (
                    <ol className="divide-y divide-neutral-100">
                      {ranking.rows.slice(0, 10).map((provider, index) => (
                        <li key={`${provider.id}-${provider.shopType}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                          <span className="min-w-0 truncate text-neutral-700">
                            <span className="mr-2 font-semibold text-neutral-400">{index + 1}.</span>
                            <span className="font-semibold text-neutral-900">{provider.name}</span>
                            <span className="ml-2 text-neutral-400">
                              {provider.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}
                            </span>
                          </span>
                          <span className="shrink-0 font-bold text-[#b38059]">{ranking.metric(provider)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <EmptyState title="Aucune prestation attribuée" description="Aucune facture de prestation n’a été attribuée à un prestataire sur cette période." className="border-0 bg-transparent py-6" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
