import React from 'react';

export default function Field({ label, children, required }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-neutral-500">
        {label}{required && <span className="ml-0.5 text-[#b38059]">*</span>}
      </label>
      {children}
    </div>
  );
}

export const inputCls = "w-full border-sm border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 transition-colors";