import React, { useState } from 'react';
import { Award, Printer } from 'lucide-react';
import Button from '../../components/Button';
import DateRangeFilter from '../../components/DateRangeFilter';
import { EmptyState, LoadingState } from '../../components/DesignSystem';
import { formatFCFA, getTodayDateStr } from '../../utils/helpers';

export default function ZReport({ zReportData, loading = false, onGenerate, onPrint, showControls = true }) {
  const today = getTodayDateStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const handleApplyPreset = (type) => {
    const now = new Date();
    const todayStr = getTodayDateStr();
    if (type === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
      if (onGenerate) onGenerate({ startDate: todayStr, endDate: todayStr });
    } else if (type === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      const s = getTodayDateStr(d);
      setStartDate(s);
      setEndDate(todayStr);
      if (onGenerate) onGenerate({ startDate: s, endDate: todayStr });
    } else if (type === 'month') {
      const s = getTodayDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      setStartDate(s);
      setEndDate(todayStr);
      if (onGenerate) onGenerate({ startDate: s, endDate: todayStr });
    }
  };

  const handleGenerate = () => {
    if (onGenerate) {
      onGenerate({ startDate, endDate });
    }
  };

  return (
    <div className="space-y-6 bg-white">
      {showControls ? (
        <div className="border-b border-neutral-200 pb-5 space-y-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <Award className="h-5 w-5 text-[#b38059]" />
            Rapport Comptable & Clôture (Z)
          </h3>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
            onPreset={handleApplyPreset}
            onReset={() => {
              setStartDate(today);
              setEndDate(today);
            }}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="primary" size="md" onClick={handleGenerate} disabled={loading}>
              <Award className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} />
              {loading ? 'Génération...' : 'Générer le rapport'}
            </Button>
            {zReportData && (
              <Button variant="ghost" size="md" onClick={() => onPrint && onPrint({ ...zReportData, isZReport: true, zReport: zReportData })}>
                <Printer className="h-4 w-4 text-[#b38059]" />
                Imprimer le ticket Z
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <Award className="h-5 w-5 text-[#b38059]" />
            Résumé comptable & clôture (Z)
          </h3>
          {zReportData && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => onPrint && onPrint({ ...zReportData, isZReport: true, zReport: zReportData })}
            >
              <Printer className="h-4 w-4 text-[#b38059]" />
              Imprimer le ticket Z
            </Button>
          )}
        </div>
      )}

      {loading && <LoadingState label="Génération du rapport Z..." rows={2} className="border-0 bg-transparent" />}

      {zReportData ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
            <div>
              <div className="text-xs text-neutral-500">
                {zReportData.periodLabel || 'Période Sélectionnée'}
              </div>
              <div className="text-3xl font-semibold text-neutral-900 mt-1">
                {formatFCFA(zReportData.totalSales || zReportData.total)}
              </div>
            </div>

            <div className="text-right space-y-0.5 text-xs text-neutral-500">
              <div>
                <strong className="text-neutral-900 font-semibold">{zReportData.validatedCount || zReportData.count}</strong> prestations validées
              </div>
              {zReportData.resPaymentCount > 0 && (
                <div>
                  + <strong className="text-neutral-900 font-semibold">{zReportData.resPaymentCount}</strong> acomptes de réservations
                </div>
              )}
              {zReportData.cancelledCount > 0 && (
                <div className="text-red-600">
                  {zReportData.cancelledCount} tickets annulés
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Breakdown */}
          {zReportData.payments && (
            <div className="border-b border-neutral-200 pb-6 space-y-3">
              <div className="text-xs text-neutral-500 font-medium">Ventilation par Mode de Règlement :</div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-neutral-500">Espèces</div>
                  <div className="mt-1 text-xl font-semibold text-neutral-900">{formatFCFA(zReportData.payments.CASH || 0)}</div>
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Mobile Money (MTN)</div>
                  <div className="mt-1 text-xl font-semibold text-neutral-900">{formatFCFA(zReportData.payments.ONLINE || 0)}</div>
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Orange Money</div>
                  <div className="mt-1 text-xl font-semibold text-[#b38059]">{formatFCFA(zReportData.payments.ORANGE_MONEY || 0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Top Selling Categories in this Period */}
          {zReportData.topSelling && zReportData.topSelling.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-500 font-medium">Répartition des ventes par Catégorie sur la période :</div>
              <div className="divide-y divide-neutral-200">
                {zReportData.topSelling.map((cat, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 text-xs">
                    <span className="font-medium text-neutral-900">{cat.name} (×{cat.quantity})</span>
                    <span className="font-semibold text-[#b38059]">{formatFCFA(cat.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        !loading && <EmptyState title="Aucun rapport affiché" description="Sélectionnez une période puis générez le rapport pour afficher les résultats." className="border-0 bg-transparent" />
      )}
    </div>
  );
}