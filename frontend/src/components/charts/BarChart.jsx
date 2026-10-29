import React, { useState } from 'react';
import { formatFCFA } from '../../utils/helpers';

export default function BarChart({
  data = [],
  height = 240,
  isDual = false,
  series1Key = 'shop1',
  series2Key = 'shop2',
  series1Label = 'Shop 1',
  series2Label = 'Shop 2',
  series1Color = '#b38059',
  series2Color = '#262626',
  valueKey = 'total',
  labelKey = 'label',
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className={`flex h-[${height}px] items-center justify-center text-xs text-neutral-400`}>
        Aucune donnée disponible pour cette période
      </div>
    );
  }

  // Calculate maximum value for Y scale
  const maxVal = Math.max(
    ...data.map((d) => (isDual ? Math.max(d[series1Key] || 0, d[series2Key] || 0) : d[valueKey] || 0)),
    1000
  );

  // Round up maxVal to a clean ceiling
  const yCeil = Math.ceil(maxVal / 5000) * 5000 || maxVal;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  const chartWidth = 650;
  const chartHeight = height;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const stepX = innerWidth / data.length;
  const barWidth = isDual ? Math.min(stepX * 0.38, 14) : Math.min(stepX * 0.55, 24);

  // Y axis ticks (4 ticks)
  const yTicks = [0, yCeil * 0.33, yCeil * 0.66, yCeil];

  return (
    <div className={`relative w-full ${className}`}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto overflow-visible select-none"
      >
        {/* Horizontal grid lines */}
        {yTicks.map((tick, idx) => {
          const y = paddingTop + innerHeight - (tick / yCeil) * innerHeight;
          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="#f0f0f0"
                strokeWidth="1"
                strokeDasharray={idx === 0 ? '0' : '3 3'}
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[9px] fill-neutral-400 font-mono"
              >
                {tick >= 1000000 ? `${(tick / 1000000).toFixed(1)}M` : tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((item, idx) => {
          const centerX = paddingLeft + idx * stepX + stepX / 2;
          const isHovered = hoverIndex === idx;

          if (isDual) {
            const v1 = item[series1Key] || 0;
            const v2 = item[series2Key] || 0;
            const h1 = Math.max((v1 / yCeil) * innerHeight, 2);
            const h2 = Math.max((v2 / yCeil) * innerHeight, 2);
            const y1 = paddingTop + innerHeight - h1;
            const y2 = paddingTop + innerHeight - h2;
            const x1 = centerX - barWidth - 1.5;
            const x2 = centerX + 1.5;

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer"
              >
                {/* Hit area */}
                <rect
                  x={centerX - stepX / 2}
                  y={paddingTop}
                  width={stepX}
                  height={innerHeight}
                  fill="transparent"
                />

                {/* Bar 1 */}
                <rect
                  x={x1}
                  y={y1}
                  width={barWidth}
                  height={h1}
                  rx="2"
                  fill={series1Color}
                  opacity={isHovered ? 1 : 0.85}
                  className="transition-all duration-200"
                />
                {/* Bar 2 */}
                <rect
                  x={x2}
                  y={y2}
                  width={barWidth}
                  height={h2}
                  rx="2"
                  fill={series2Color}
                  opacity={isHovered ? 1 : 0.85}
                  className="transition-all duration-200"
                />

                {/* X label */}
                <text
                  x={centerX}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className={`text-[9.5px] font-medium transition-colors ${
                    isHovered ? 'fill-neutral-900 font-bold' : 'fill-neutral-400'
                  }`}
                >
                  {item[labelKey]}
                </text>
              </g>
            );
          }

          // Single bar
          const val = item[valueKey] || 0;
          const barH = Math.max((val / yCeil) * innerHeight, val > 0 ? 3 : 0);
          const barY = paddingTop + innerHeight - barH;
          const barX = centerX - barWidth / 2;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className="cursor-pointer"
            >
              {/* Hit area */}
              <rect
                x={centerX - stepX / 2}
                y={paddingTop}
                width={stepX}
                height={innerHeight}
                fill={isHovered ? '#b380590a' : 'transparent'}
                rx="4"
              />

              {/* Bar */}
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barH}
                rx="3"
                fill={isHovered ? '#9e6d47' : series1Color}
                opacity={isHovered ? 1 : 0.88}
                className="transition-all duration-200"
              />

              {/* X label */}
              <text
                x={centerX}
                y={chartHeight - 12}
                textAnchor="middle"
                className={`text-[9.5px] font-medium transition-colors ${
                  isHovered ? 'fill-neutral-900 font-bold' : 'fill-neutral-400'
                }`}
              >
                {item[labelKey]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="pointer-events-none absolute z-20 rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-xl -translate-x-1/2 -translate-y-full"
          style={{
            left: `${((paddingLeft + hoverIndex * stepX + stepX / 2) / chartWidth) * 100}%`,
            top: `${(paddingTop / chartHeight) * 100}%`,
          }}
        >
          <p className="font-semibold text-neutral-300 pb-1 border-b border-neutral-700 mb-1">
            {data[hoverIndex].fullDate || data[hoverIndex][labelKey]}
          </p>
          {isDual ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series1Color }} />
                  {series1Label}:
                </span>
                <span className="font-bold">{formatFCFA(data[hoverIndex][series1Key] || 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series2Color }} />
                  {series2Label}:
                </span>
                <span className="font-bold">{formatFCFA(data[hoverIndex][series2Key] || 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-800 text-[#d4af37]">
                <span>Total:</span>
                <span className="font-bold">{formatFCFA(data[hoverIndex][valueKey] || 0)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="font-bold text-[#e6b17e]">{formatFCFA(data[hoverIndex][valueKey] || 0)}</p>
              {data[hoverIndex].count !== undefined && (
                <p className="text-[10px] text-neutral-400">{data[hoverIndex].count} tickets</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dual Series Legend */}
      {isDual && (
        <div className="mt-2 flex items-center justify-center gap-6 text-xs text-neutral-600">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series1Color }} />
            <span>{series1Label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series2Color }} />
            <span>{series2Label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
