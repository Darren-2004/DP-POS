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
  const [shopReports, setShopReports] = useState({});
  const [shopReportErrors, setShopReportErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const reportShopTypes = shopType ? [shopType] : ['HOMME', 'FEMME'];

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
    setShopReportErrors({});
    setShopReports({});

    try {
      const results = await Promise.all(reportShopTypes.map(async (reportShopType) => {
        const params = new URLSearchParams({ startDate, endDate, shopType: reportShopType });
        const [zResponse, salesResponse, providerStatsResponse] = await Promise.all([
          apiFetch(`${API_BASE}/z-report?${params.toString()}`),
          apiFetch(`${API_BASE}/product-sales-report?${params.toString()}`),
          apiFetch(`${API_BASE}/service-provider-stats?${params.toString()}`),
        ]);
        const [zReport, salesReport, providerStats] = await Promise.all([
          zResponse.json(),
          salesResponse.json(),
          providerStatsResponse.json(),
        ]);
        return {
          shopType: reportShopType,
          data: {
            zReport: zResponse.ok ? zReport : null,
            salesReport: salesResponse.ok ? salesReport : null,
            providerStats: providerStatsResponse.ok ? providerStats : null,
          },
          errors: {
            zReport: zResponse.ok ? '' : zReport.detail || 'Erreur lors de la génération du rapport Z.',
            salesReport: salesResponse.ok ? '' : salesReport.detail || 'Erreur lors de la génération du rapport détaillé.',
            providerStats: providerStatsResponse.ok ? '' : providerStats.detail || providerStats.error || 'Erreur lors du chargement des statistiques prestataires.',
          },
        };
      }));
      setShopReports(Object.fromEntries(results.map((result) => [result.shopType, result.data])));
      const errors = Object.fromEntries(results.map((result) => [result.shopType, result.errors]));
      setShopReportErrors(errors);
      if (results.some(({ errors: shopErrors }) => Object.values(shopErrors).some(Boolean))) {
        showToast('Un ou plusieurs rapports n’ont pas pu être générés.', 'error');
      }
    } catch (error) {
      console.error(error);
      setShopReportErrors(Object.fromEntries(reportShopTypes.map((reportShopType) => [
        reportShopType,
        {
          zReport: 'Erreur réseau lors de la génération du rapport Z.',
          salesReport: 'Erreur réseau lors de la génération du rapport détaillé.',
          providerStats: 'Erreur réseau lors du chargement des statistiques prestataires.',
        },
      ])));
    } finally {
      setLoading(false);
    }
  };

  const hasReports = reportShopTypes.some((reportShopType) =>
    Object.values(shopReports[reportShopType] || {}).some(Boolean)
    || Object.values(shopReportErrors[reportShopType] || {}).some(Boolean)
  );

  return (
    <div className="space-y-6 bg-white">
      <div className="space-y-4 border-b border-neutral-200 pb-5">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Rapports comptable & ventes</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Consultez le rapport de clôture, le détail des ventes et les performances des prestataires sur la même période.
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

      {loading && <p role="status" className="text-xs text-neutral-500">Génération des rapports...</p>}
      {!loading && !hasReports && (
        <p className="py-8 text-center text-xs text-neutral-500">Sélectionnez une période puis générez les rapports.</p>
      )}

      {hasReports && reportShopTypes.map((reportShopType) => {
        const report = shopReports[reportShopType] || {};
        const errors = shopReportErrors[reportShopType] || {};
        const shopName = reportShopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME;
        const providers = report.providerStats?.providers || [];

        return (
          <section key={reportShopType} className="space-y-6 border-b border-neutral-200 pb-8">
            {!shopType && <h2 className="border-b border-neutral-200 pb-3 text-lg font-bold text-neutral-900">{shopName}</h2>}

            {(report.zReport || errors.zReport) && (
              errors.zReport ? (
                <ErrorState title={`Rapport Z — ${shopName}`} description={errors.zReport} onRetry={generateReports} />
              ) : (
                <ZReport
                  zReportData={{ ...report.zReport, shopName }}
                  loading={false}
                  showControls={false}
                  showPrintButton={Boolean(shopType) || reportShopType === reportShopTypes.find((type) => shopReports[type]?.zReport)}
                  printLabel={shopType ? 'Imprimer le ticket Z' : 'Imprimer le rapport Z des deux salons'}
                  onPrint={(data) => {
                    const reportsToPrint = reportShopTypes
                      .filter((type) => shopReports[type]?.zReport)
                      .map((type) => ({
                        ...shopReports[type].zReport,
                        shopType: type,
                        shopName: type === 'HOMME' ? shopNames.HOMME : shopNames.FEMME,
                        serviceProviders: shopReports[type].providerStats?.providers || [],
                      }));
                    triggerPrint({
                      ...data,
                      id: `z-report-${reportShopTypes.join('-')}-${startDate}-${endDate}`,
                      zReport: {
                        ...data.zReport,
                        shopReports: reportsToPrint,
                      },
                    });
                  }}
                />
              )
            )}

            {(report.salesReport || errors.salesReport) && (
              <ProductSalesReport
                shopType={reportShopType}
                combinedMode
                combinedReportData={report.salesReport}
                combinedStartDate={startDate}
                combinedEndDate={endDate}
                combinedLoading={false}
                combinedError={errors.salesReport}
              />
            )}

            {(report.providerStats || errors.providerStats) && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Performance des prestataires — {shopName}</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Nombre de prestations attribuées et chiffre d’affaires associé à la période.
                  </p>
                </div>
                {errors.providerStats ? (
                  <ErrorState title="Statistiques prestataires indisponibles" description={errors.providerStats} onRetry={generateReports} />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    {providers.length ? (
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Prestataire</th>
                            <th className="px-4 py-3 text-right font-semibold">Prestations réalisées</th>
                            <th className="px-4 py-3 text-right font-semibold">Chiffre d’affaires</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {[...providers]
                            .sort((a, b) => b.revenue - a.revenue || b.serviceCount - a.serviceCount || a.name.localeCompare(b.name))
                            .map((provider) => (
                              <tr key={`${provider.id}-${provider.shopType}`}>
                                <td className="px-4 py-3 font-semibold text-neutral-900">{provider.name}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{provider.serviceCount}</td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#b38059]">{formatFCFA(provider.revenue)}</td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-neutral-300 bg-neutral-50 font-bold">
                          <tr>
                            <td className="px-4 py-3 text-neutral-900">Total</td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                              {providers.reduce((sum, provider) => sum + provider.serviceCount, 0)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#b38059]">
                              {formatFCFA(providers.reduce((sum, provider) => sum + provider.revenue, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <EmptyState title="Aucun prestataire enregistré" description="Aucune prestation n’a été attribuée à un prestataire sur cette période." className="border-0 bg-transparent py-6" />
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
