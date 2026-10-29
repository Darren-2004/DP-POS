import React, { useState } from 'react';
import { formatFCFA } from '../../utils/helpers';

export default function DualLineChart({
  data = [],
  height = 250,
  series1Key = 'shop1',
  series2Key = 'shop2',
  series1Label = 'Shop 1',
  series2Label = 'Shop 2',
  series1Color = '#b38059',
  series2Color = '#2563eb',
  labelKey = 'label',
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className={`flex h-[${height}px] items-center justify-center text-xs text-neutral-400`}>
        Aucune donnée comparative disponible
      </div>
    );
  }

  // Find max value across both series
  const maxVal = Math.max(
    ...data.map((d) => Math.max(Number(d[series1Key]) || 0, Number(d[series2Key]) || 0)),
    1000
  );
  const yCeil = Math.ceil(maxVal / 5000) * 5000 || maxVal;

  const paddingLeft = 60;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;
  const chartWidth = 650;
  const chartHeight = height;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const stepX = innerWidth / (data.length > 1 ? data.length - 1 : 1);

  // Compute points for Series 1 and Series 2
  const points1 = data.map((d, idx) => {
    const x = data.length === 1 ? paddingLeft + innerWidth / 2 : paddingLeft + idx * stepX;
    const y = paddingTop + innerHeight - ((Number(d[series1Key]) || 0) / yCeil) * innerHeight;
    return { x, y, val: Number(d[series1Key]) || 0, data: d };
  });

  const points2 = data.map((d, idx) => {
    const x = data.length === 1 ? paddingLeft + innerWidth / 2 : paddingLeft + idx * stepX;
    const y = paddingTop + innerHeight - ((Number(d[series2Key]) || 0) / yCeil) * innerHeight;
    return { x, y, val: Number(d[series2Key]) || 0, data: d };
  });

  // Smooth path generators
  const buildPath = (pts) => {
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    return pts.reduce((acc, curr, idx, arr) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      const prev = arr[idx - 1];
      const cpX = (prev.x + curr.x) / 2;
      return `${acc} C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }, '');
  };

  const path1 = buildPath(points1);
  const path2 = buildPath(points2);

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

        {/* Line 1: Shop 1 */}
        <path
          d={path1}
          fill="none"
          stroke={series1Color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Line 2: Shop 2 */}
        <path
          d={path2}
          fill="none"
          stroke={series2Color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Points and Vertical hover guide */}
        {points1.map((pt1, idx) => {
          const pt2 = points2[idx];
          const isHovered = hoverIndex === idx;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className="cursor-pointer"
            >
              {/* Hit column */}
              <rect
                x={pt1.x - stepX / 2}
                y={paddingTop}
                width={stepX}
                height={innerHeight}
                fill="transparent"
              />

              {/* Vertical dotted guide on hover */}
              {isHovered && (
                <line
                  x1={pt1.x}
                  y1={paddingTop}
                  x2={pt1.x}
                  y2={paddingTop + innerHeight}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}

              {/* Point 1 (Shop 1) */}
              <circle
                cx={pt1.x}
                cy={pt1.y}
                r={isHovered ? 5.5 : 3.5}
                fill="#ffffff"
                stroke={series1Color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all duration-150"
              />

              {/* Point 2 (Shop 2) */}
              <circle
                cx={pt2.x}
                cy={pt2.y}
                r={isHovered ? 5.5 : 3.5}
                fill="#ffffff"
                stroke={series2Color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all duration-150"
              />

              {/* X label */}
              <text
                x={pt1.x}
                y={chartHeight - 12}
                textAnchor="middle"
                className={`text-[9.5px] font-medium transition-colors ${
                  isHovered ? 'fill-neutral-900 font-bold' : 'fill-neutral-400'
                }`}
              >
                {pt1.data[labelKey]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg bg-neutral-900 px-3.5 py-2.5 text-xs text-white shadow-xl -translate-x-1/2 -translate-y-full"
          style={{
            left: `${((points1[hoverIndex].x) / chartWidth) * 100}%`,
            top: `${(paddingTop / chartHeight) * 100 + 10}%`,
          }}
        >
          <p className="font-bold text-neutral-200 pb-1 border-b border-neutral-700 mb-1.5">
            {data[hoverIndex].fullLabel || data[hoverIndex][labelKey]}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series1Color }} />
                {series1Label}:
              </span>
              <span className="font-bold text-[#e6b17e]">{formatFCFA(data[hoverIndex][series1Key] || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series2Color }} />
                {series2Label}:
              </span>
              <span className="font-bold text-blue-300">{formatFCFA(data[hoverIndex][series2Key] || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-neutral-800 text-[11px]">
              <span className="text-neutral-400">Total :</span>
              <span className="font-bold text-white">
                {formatFCFA((Number(data[hoverIndex][series1Key]) || 0) + (Number(data[hoverIndex][series2Key]) || 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-8 text-xs font-semibold text-neutral-700">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: series1Color }} />
          <span>{series1Label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: series2Color }} />
          <span>{series2Label}</span>
        </div>
      </div>
    </div>
  );
}
