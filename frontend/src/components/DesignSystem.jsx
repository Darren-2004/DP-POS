import React from 'react';
import { AlertCircle, PackageOpen, RefreshCw } from 'lucide-react';
import { cx } from '../utils/helpers';

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold text-[#b38059]">{eyebrow}</p>}
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Surface({ as: Element = 'section', className, children, ...props }) {
  return (
    <Element className={cx('bg-white border-b border-neutral-200', className)} {...props}>
      {children}
    </Element>
  );
}

export function LoadingState({ label = 'Chargement...', rows = 3, className }) {
  return (
    <div role="status" aria-live="polite" className={cx('space-y-3 py-4', className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        <RefreshCw className="h-4 w-4 animate-spin text-[#b38059]" />
        <span>{label}</span>
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-8 animate-pulse bg-neutral-100" />
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Aucun élément', description, action, className }) {
  return (
    <div className={cx('flex min-h-40 flex-col items-center justify-center py-8 text-center', className)}>
      <PackageOpen className="mb-2 h-6 w-6 text-neutral-400" />
      <h3 className="text-xs font-bold text-neutral-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-xs leading-5 text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Erreur lors du chargement', description, onRetry, className }) {
  return (
    <div role="alert" className={cx('flex flex-col items-start gap-3 border-b border-neutral-200 py-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div>
          <h3 className="text-xs font-bold text-rose-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs leading-5 text-rose-700">{description}</p>}
        </div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-neutral-50 cursor-pointer">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      )}
    </div>
  );
}