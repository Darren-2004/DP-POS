import React from 'react';
import { cx } from '../utils/helpers';

export default function StatusChip({ tone = 'emerald', label, className }) {
  const tones = {
    emerald: 'text-emerald-800',
    amber: 'text-amber-800',
    red: 'text-rose-800',
    gold: 'text-[#825534]',
    neutral: 'text-neutral-500',
  };

  return (
    <span className={cx('inline-flex items-center text-xs font-medium', tones[tone] || tones.neutral, className)}>
      {label}
    </span>
  );
}