import React, { useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';
import Button from '../../components/Button';
import DateRangeFilter from '../../components/DateRangeFilter';
import { getTodayDateStr, showToast, triggerPrint } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';
import ZReport from './ZReport';
import ProductSalesReport from './ProductSalesReport';

export default function CombinedReports({ shopType = null }) {
  const today = getTodayDateStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [zReportData, setZReportData] = useState(null);
  const [salesReportData, setSalesReportData] = useState(null);
  const [zReportError, setZReportError] = useState('');
  const [salesReportError, setSalesReportError] = useState('');
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
    setZReportData(null);
    setSalesReportData(null);
    const params = new URLSearchParams({ startDate, endDate });
    if (shopType) params.append('shopType', shopType);

    try {
      const [zResponse, salesResponse] = await Promise.all([
        fetch(`${API_BASE}/z-report?${params.toString()}`),
        fetch(`${API_BASE}/product-sales-report?${params.toString()}`),
      ]);
      const [zResult, salesResult] = await Promise.all([
        zResponse.ok ? zResponse.json() : Promise.resolve(null),
        salesResponse.ok ? salesResponse.json() : Promise.resolve(null),
      ]);

      if (zResponse.ok) setZReportData(zResult);
      else setZReportError('Erreur lors de la génération du rapport Z.');
      if (salesResponse.ok) setSalesReportData(salesResult);
      else setSalesReportError('Erreur lors de la génération du rapport détaillé.');
      if (!zResponse.ok || !salesResponse.ok) {
        showToast('Un ou plusieurs rapports n’ont pas pu être générés.', 'error');
      }
    } catch (error) {
      console.error(error);
      setZReportError('Erreur réseau lors de la génération du rapport Z.');
      setSalesReportError('Erreur réseau lors de la génération du rapport détaillé.');
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
    </div>
  );
}
