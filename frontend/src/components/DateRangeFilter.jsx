import React from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { cx } from '../utils/helpers';

const presetButton = (isActive) =>
  cx(
    'rounded-xl border px-3 py-1.5 text-[10px] font-bold transition cursor-pointer',
    isActive
      ? 'border-[#b38059]/40 bg-[#faf4ed] text-[#b38059] shadow-xs'
      : 'border-[rgba(44,24,16,0.1)] bg-[#faf7f2] text-[#7a5c4e] hover:bg-[#f3ece4] hover:text-[#2c1810]'
  );

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onPreset,
  onReset,
  className,
  labels = { today: 'Aujourd\'hui', week: 'Cette semaine', month: 'Ce mois-ci', reset: 'Réinitialiser' },
}) {
  return (
    <div className={cx('rounded-2xl border border-[rgba(44,24,16,0.08)] bg-white p-4 shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#2c1810]">
          <CalendarDays className="h-4 w-4 text-[#b38059]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a5c4e]">Période</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onPreset && onPreset('today')} className={presetButton(Boolean(startDate && startDate === endDate))}>
            {labels.today}
          </button>
          <button type="button" onClick={() => onPreset && onPreset('week')} className={presetButton(false)}>
            {labels.week}
          </button>
          <button type="button" onClick={() => onPreset && onPreset('month')} className={presetButton(false)}>
            {labels.month}
          </button>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(44,24,16,0.08)] pt-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#7a5c4e]">Du :</label>
            <input
              type="date"
              value={startDate || ''}
              onChange={(e) => onStartChange && onStartChange(e.target.value)}
              className="rounded-xl border border-[rgba(44,24,16,0.12)] bg-[#faf7f2] px-3 py-1.5 text-xs text-[#2c1810] outline-none transition focus:border-[#b38059]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#7a5c4e]">Au :</label>
            <input
              type="date"
              value={endDate || ''}
              onChange={(e) => onEndChange && onEndChange(e.target.value)}
              className="rounded-xl border border-[rgba(44,24,16,0.12)] bg-[#faf7f2] px-3 py-1.5 text-xs text-[#2c1810] outline-none transition focus:border-[#b38059]"
            />
          </div>
        </div>

        {(onReset || startDate || endDate) && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(44,24,16,0.1)] bg-[#faf7f2] px-3 py-1.5 text-[10px] font-bold text-[#7a5c4e] transition hover:bg-[#f3ece4] hover:text-[#2c1810] cursor-pointer">
            <RotateCcw className="h-3.5 w-3.5" />
            {labels.reset}
          </button>
        )}
      </div>
    </div>
  );
}