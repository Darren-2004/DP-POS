import React from 'react';
import { cx } from '../utils/helpers';

const variantClasses = {
  primary:
    'bg-[#b38059] text-white hover:bg-[#9d6f4b] active:bg-[#875d3c] shadow-sm shadow-[#b38059]/20 border border-transparent',
  ghost:
    'border border-[rgba(44,24,16,0.12)] bg-[#faf7f2] text-[#2c1810] hover:bg-[#f3ece4] active:bg-[#e8decb]',
  danger:
    'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-sm shadow-rose-600/20 border border-transparent',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 shadow-sm shadow-emerald-600/20 border border-transparent',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-[11px] font-bold tracking-wide',
  md: 'px-4 py-2 text-xs font-semibold tracking-wide',
  lg: 'px-5 py-2.5 text-xs font-bold tracking-wider uppercase',
};

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#b38059]/30 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none cursor-pointer select-none',
        variantClasses[variant] || variantClasses.primary,
        sizeClasses[size] || sizeClasses.md,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}