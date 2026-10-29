import React, { useState } from 'react';
import { formatFCFA } from '../../utils/helpers';

export default function DonutChart({
  data = [],
  size = 200,
  strokeWidth = 26,
  centerTitle = 'Total',
  centerSubtitle = '',
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  if (!data || data.length === 0 || total === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-xs text-neutral-400 ${className}`}>
        Aucun encaissement sur cette période
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Compute strokeDasharray and strokeDashoffset for each segment
  let accumulatedAngle = 0;
  const segments = data.map((item, idx) => {
    const val = Number(item.value) || 0;
    const ratio = total > 0 ? val / total : 0;
    const strokeDasharray = `${ratio * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedAngle * circumference;
    accumulatedAngle += ratio;
    const percentage = Math.round(ratio * 100);

    return {
      ...item,
      ratio,
      strokeDasharray,
      strokeDashoffset,
      percentage,
      idx,
    };
  });

  const activeItem = hoverIndex !== null ? segments[hoverIndex] : null;

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] select-none"
        >
          {/* Background circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#f5f5f5"
            strokeWidth={strokeWidth}
          />

          {/* Segments */}
          {segments.map((seg) => {
            const isHovered = hoverIndex === seg.idx;
            return (
              <circle
                key={seg.idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={seg.color || '#b38059'}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                onMouseEnter={() => setHoverIndex(seg.idx)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer transition-all duration-200"
                style={{
                  transformOrigin: '50% 50%',
                  opacity: hoverIndex !== null && !isHovered ? 0.6 : 1,
                }}
              />
            );
          })}
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {activeItem ? (
            <>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                {activeItem.label}
              </span>
              <span className="text-base font-bold text-neutral-900 mt-0.5">
                {activeItem.percentage}%
              </span>
              <span className="text-[10px] text-neutral-500 font-medium">
                {formatFCFA(activeItem.value)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                {centerTitle}
              </span>
              <span className="text-sm font-bold text-neutral-900 mt-0.5">
                {formatFCFA(total)}
              </span>
              {centerSubtitle && (
                <span className="text-[9px] text-neutral-400">{centerSubtitle}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="w-full space-y-1.5 pt-2 border-t border-neutral-100">
        {segments.map((seg) => {
          const isHovered = hoverIndex === seg.idx;
          return (
            <div
              key={seg.idx}
              onMouseEnter={() => setHoverIndex(seg.idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className={`flex items-center justify-between text-xs py-1 px-2 rounded cursor-pointer transition ${
                isHovered ? 'bg-neutral-50 font-semibold' : 'text-neutral-600'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color || '#b38059' }}
                />
                <span className="truncate">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-neutral-400 text-[11px]">{seg.percentage}%</span>
                <span className="font-semibold text-neutral-900">{formatFCFA(seg.value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
