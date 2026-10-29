import React, { useState } from 'react';
import { PackageSearch, Printer, TrendingUp, RefreshCw } from 'lucide-react';
import Button from '../../components/Button';
import DateRangeFilter from '../../components/DateRangeFilter';
import { EmptyState, ErrorState, LoadingState } from '../../components/DesignSystem';
import { formatFCFA, getTodayDateStr } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';

const SHOP_NAME = 'SALON DE BEAUTÉ';

export default function ProductSalesReport({
  shopType = null,
  combinedMode = false,
  combinedReportData = null,
  combinedStartDate = '',
  combinedEndDate = '',
  combinedLoading = false,
  combinedError = '',
}) {
  const today = getTodayDateStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePreset = (type) => {
    const now = new Date();
    const todayStr = getTodayDateStr();
    if (type === 'today') {
      setStartDate(todayStr); setEndDate(todayStr);
    } else if (type === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
      setStartDate(getTodayDateStr(d));
      setEndDate(todayStr);
    } else if (type === 'month') {
      setStartDate(getTodayDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(todayStr);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setReportData(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (shopType) params.append('shopType', shopType);
      const url = `${API_BASE}/product-sales-report?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) { setError('Erreur lors de la récupération du rapport.'); return; }
      const data = await res.json();
      setReportData(data);
    } catch (e) {
      console.error(e);
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  };

  const displayedReportData = combinedMode ? combinedReportData : reportData;
  const displayedStartDate = combinedMode ? combinedStartDate : startDate;
  const displayedEndDate = combinedMode ? combinedEndDate : endDate;
  const displayedLoading = combinedMode ? combinedLoading : loading;
  const displayedError = combinedMode ? combinedError : error;

  const handlePrint = () => {
    if (!displayedReportData) return;

    const formatNum = (n) => Math.round(n).toLocaleString('fr-FR');

    const rows = displayedReportData.products.map(p =>
      `<tr style="border-bottom:0.5px solid #ddd;">
        <td style="padding:5px 4px;word-break:break-word;">${p.name}</td>
        <td style="padding:5px 4px;text-align:center;font-weight:bold;">${p.quantity}</td>
        <td style="padding:5px 4px;text-align:right;font-weight:bold;">${formatNum(p.total)} FCFA</td>
      </tr>`
    ).join('');

    const dateLabel = displayedStartDate === displayedEndDate
      ? new Date(displayedStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : `Du ${new Date(displayedStartDate + 'T12:00:00').toLocaleDateString('fr-FR')} au ${new Date(displayedEndDate + 'T12:00:00').toLocaleDateString('fr-FR')}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 portrait; margin: 15mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; }
    h1 { text-align: center; font-size: 16pt; letter-spacing: 3px; margin: 0 0 4px; }
    .subtitle { text-align: center; font-size: 9pt; margin: 2px 0; }
    .period { text-align: center; font-size: 10pt; font-weight: bold; margin: 6px 0 2px; }
    hr { border: none; border-top: 1.5px dashed #000; margin: 6px 0; }
    hr.solid { border-top: 2px solid #000; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { font-size: 9pt; font-weight: bold; border-bottom: 2px solid #000; border-top: 2px solid #000; padding: 5px 4px; text-align: left; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3) { text-align: right; }
    tbody tr:nth-child(even) { background: #f9f9f9; }
    tfoot td { font-weight: bold; border-top: 2px solid #000; padding: 6px 4px; }
    .total-box { margin-top: 10px; border: 2px solid #000; padding: 8px 12px; display: flex; justify-content: space-between; font-size: 12pt; font-weight: bold; }
    .footer { margin-top: 20px; text-align: center; font-size: 8pt; }
  </style>
</head>
<body>
  <h1>${SHOP_NAME}</h1>
  <div class="subtitle">─── RAPPORT DÉTAILLÉ DES VENTES PAR PRESTATION & PRODUIT ───</div>
  <hr>
  <div class="period">Période : ${dateLabel}</div>
  <div class="subtitle">Généré le ${new Date().toLocaleString('fr-FR')}</div>
  <hr class="solid">
  <table>
    <thead>
      <tr>
        <th style="width:50%">Désignation / Prestation</th>
        <th style="width:20%;text-align:center;">Qté</th>
        <th style="width:30%;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">TOTAL GÉNÉRAL (${displayedReportData.products.length} articles)</td>
          <td style="text-align:right;font-size:12pt;">${formatNum(displayedReportData.grandTotal)} FCFA</td>
      </tr>
    </tfoot>
  </table>
  <hr class="solid">
  <div class="footer">
    Rapport généré automatiquement — Salon de Beauté
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const dateLabel = displayedReportData
    ? (displayedStartDate === displayedEndDate
        ? new Date(displayedStartDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : `Du ${new Date(displayedStartDate + 'T12:00:00').toLocaleDateString('fr-FR')} au ${new Date(displayedEndDate + 'T12:00:00').toLocaleDateString('fr-FR')}`)
    : '';

  return (
    <div className="space-y-6 bg-white">
      {!combinedMode && <div className="border-b border-neutral-200 pb-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
          <PackageSearch className="h-5 w-5 text-[#b38059]" />
          Rapport Détaillé des Ventes par Prestation & Produit
        </h3>

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

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="primary" size="md" onClick={handleGenerate} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {loading ? 'Chargement...' : 'Générer le rapport'}
          </Button>

          {reportData && (
            <Button variant="ghost" size="md" onClick={handlePrint}>
              <Printer className="h-4 w-4 text-[#b38059]" />
              Imprimer le rapport
            </Button>
          )}
        </div>
      </div>}

      {/* Error */}
      {displayedError && <ErrorState title="Rapport détaillé indisponible" description={displayedError} onRetry={combinedMode ? undefined : handleGenerate} />}
      {displayedLoading && <LoadingState label="Chargement du rapport détaillé..." rows={4} className="border-0 bg-transparent" />}

      {/* Results Table */}
      {displayedReportData ? (
        <div className="space-y-4">
          {combinedMode && (
            <h3 className="flex items-center gap-2 border-b border-neutral-200 pb-3 text-base font-semibold text-neutral-900">
              <PackageSearch className="h-5 w-5 text-[#b38059]" />
              Détail des ventes par prestation & produit
            </h3>
          )}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div>
              <div className="text-xs text-neutral-500">{dateLabel}</div>
              <div className="text-2xl font-semibold text-[#b38059] mt-0.5">
                {formatFCFA(displayedReportData.grandTotal)}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {displayedReportData.products.length} prestations / produits · {displayedReportData.totalQuantity} actes vendus
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded bg-[#b38059] text-white px-3.5 py-2 text-xs font-semibold transition hover:bg-[#9e6d47]"
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="py-2 pr-4 font-normal">Désignation</th>
                  <th className="py-2 px-4 text-center font-normal">Quantité</th>
                  <th className="py-2 pl-4 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {displayedReportData.products.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8">
                      <EmptyState title="Aucune vente sur cette période" description="Aucune prestation ne correspond à la période sélectionnée." className="border-0 bg-transparent" />
                    </td>
                  </tr>
                ) : displayedReportData.products.map((product, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50">
                    <td className="py-2.5 pr-4 font-medium text-neutral-900">
                      {product.name}
                    </td>
                    <td className="py-2.5 px-4 text-center font-medium text-neutral-700">
                      ×{product.quantity}
                    </td>
                    <td className="py-2.5 pl-4 text-right font-semibold text-[#b38059]">
                      {formatFCFA(product.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-900">
                  <td className="py-3 pr-4 font-semibold text-neutral-900" colSpan={2}>
                    TOTAL GÉNÉRAL · {displayedReportData.totalQuantity} actes
                  </td>
                  <td className="py-3 pl-4 text-right font-semibold text-[#b38059] text-base">
                    {formatFCFA(displayedReportData.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : !displayedLoading && !displayedError && (
        <EmptyState title="Aucun rapport affiché" description="Sélectionnez une période puis générez le rapport des ventes par prestation." className="border-0 bg-transparent" />
      )}
    </div>
  );
}