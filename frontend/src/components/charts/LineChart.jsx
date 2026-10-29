import React, { useState } from 'react';
import { formatFCFA } from '../../utils/helpers';

export default function LineChart({
  data = [],
  height = 240,
  valueKey = 'total',
  labelKey = 'label',
  lineColor = '#b38059',
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

  const maxVal = Math.max(...data.map((d) => d[valueKey] || 0), 1000);
  const yCeil = Math.ceil(maxVal / 5000) * 5000 || maxVal;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  const chartWidth = 650;
  const chartHeight = height;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const stepX = innerWidth / (data.length > 1 ? data.length - 1 : 1);

  // Points calculation
  const points = data.map((d, idx) => {
    const x = data.length === 1 ? paddingLeft + innerWidth / 2 : paddingLeft + idx * stepX;
    const y = paddingTop + innerHeight - ((d[valueKey] || 0) / yCeil) * innerHeight;
    return { x, y, data: d };
  });

  // SVG path strings
  const pathD = points.length === 1
    ? `M ${points[0].x} ${points[0].y}`
    : points.reduce((acc, curr, idx, arr) => {
        if (idx === 0) return `M ${curr.x} ${curr.y}`;
        const prev = arr[idx - 1];
        const cpX = (prev.x + curr.x) / 2;
        return `${acc} C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
      }, '');

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

        {/* Clean Line curve - No gradient */}
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points & hover triggers */}
        {points.map((pt, idx) => {
          const isHovered = hoverIndex === idx;
          return (
            <g
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className="cursor-pointer"
            >
              {/* Hit area */}
              <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

              {/* Point circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 3.5}
                fill={isHovered ? '#ffffff' : lineColor}
                stroke={lineColor}
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all duration-150"
              />

              {/* X label */}
              {(data.length <= 15 || idx % Math.ceil(data.length / 12) === 0 || idx === data.length - 1) && (
                <text
                  x={pt.x}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className={`text-[9.5px] font-medium transition-colors ${
                    isHovered ? 'fill-neutral-900 font-bold' : 'fill-neutral-400'
                  }`}
                >
                  {pt.data[labelKey]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="pointer-events-none absolute z-20 rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-xl -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(points[hoverIndex].x / chartWidth) * 100}%`,
            top: `${(points[hoverIndex].y / chartHeight) * 100 - 10}%`,
          }}
        >
          <p className="font-semibold text-neutral-300 pb-1 border-b border-neutral-700 mb-1">
            {points[hoverIndex].data.fullDate || points[hoverIndex].data[labelKey]}
          </p>
          <p className="font-bold text-[#e6b17e]">{formatFCFA(points[hoverIndex].data[valueKey] || 0)}</p>
          {points[hoverIndex].data.count !== undefined && (
            <p className="text-[10px] text-neutral-400">{points[hoverIndex].data.count} tickets</p>
          )}
        </div>
      )}
    </div>
  );
}
