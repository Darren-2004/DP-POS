import React from 'react';
import Modal from './Modal';

export default function ConfirmModal({ open, title = 'Confirmer', message, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} widthCls="max-w-sm">
      <div className="space-y-4 p-1">
        <div className="text-sm font-bold text-neutral-900">{title}</div>
        <div className="text-xs leading-5 text-neutral-500">{message}</div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
          <button
            onClick={onCancel}
            className="rounded border border-neutral-200 bg-white hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-medium text-neutral-900 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </div>
    </Modal>
  );
}