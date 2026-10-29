import React from 'react';
import { X } from 'lucide-react';
import { cx } from '../utils/helpers';

export default function Modal({ onClose, children, widthCls = 'max-w-xs', open = true }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4 transition-opacity"
      onClick={onClose}
    >
      <div
        className={cx(
          'relative w-full rounded border border-neutral-200 bg-white p-6 max-h-[90vh] overflow-y-auto',
          widthCls
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1 text-neutral-400 hover:text-neutral-900 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}