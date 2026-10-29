import React from 'react';
import { cx } from '../utils/helpers';

export default function IconButton({ icon, onClick, tone = 'default', title, disabled }) {
  const tones = {
    default: 'text-neutral-500 hover:text-neutral-900',
    danger: 'text-rose-600 hover:text-rose-800',
    info: 'text-sky-600 hover:text-sky-800',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center rounded p-1 transition-colors disabled:opacity-45 disabled:pointer-events-none cursor-pointer focus:outline-none',
        tones[tone] || tones.default
      )}
    >
      {icon}
    </button>
  );
}