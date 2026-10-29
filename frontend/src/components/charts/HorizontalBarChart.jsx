import React from 'react';
import { formatFCFA } from '../../utils/helpers';

export default function HorizontalBarChart({
  data = [],
  valueKey = 'revenue',
  quantityKey = 'quantity',
  labelKey = 'name',
  barColor = '#b38059',
  emptyMessage = 'Aucune donnée disponible',
  showRank = true,
  className = '',
}) {
  if (!data || data.length === 0) {
    return (
      <div className={`py-8 text-center text-xs text-neutral-400 ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div className={`space-y-3 ${className}`}>
      {data.map((item, idx) => {
        const val = Number(item[valueKey]) || 0;
        const qty = item[quantityKey];
        const pct = Math.min(Math.round((val / maxVal) * 100), 100);

        return (
          <div key={idx} className="group text-xs">
            {/* Top row: Rank, Label, Quantity & Amount */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {showRank && (
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      idx === 0
                        ? 'bg-[#b38059] text-white'
                        : idx === 1
                        ? 'bg-neutral-800 text-white'
                        : idx === 2
                        ? 'bg-neutral-400 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {idx + 1}
                  </span>
                )}
                <span className="truncate font-medium text-neutral-900 group-hover:text-[#b38059] transition-colors">
                  {item[labelKey]}
                </span>
                {item.percentage !== undefined && (
                  <span className="text-[10px] text-neutral-400">({item.percentage}%)</span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {qty !== undefined && (
                  <span className="text-[10px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded">
                    {qty} {qty > 1 ? 'ventes' : 'vente'}
                  </span>
                )}
                <span className="font-semibold text-neutral-900">{formatFCFA(val)}</span>
              </div>
            </div>

            {/* Progress track */}
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: barColor,
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
