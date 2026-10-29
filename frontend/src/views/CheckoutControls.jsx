import React from 'react';
import { Clock3, Printer } from 'lucide-react';
import ClientAutocomplete from '../components/ClientAutocomplete';
import { formatFCFA, cx } from '../utils/helpers';

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Espèces' },
  { id: 'ONLINE', label: 'Mobile Money' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
];

const fieldCls =
  'w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export default function CheckoutControls({
  cart,
  total,
  currentUser,
  serverOnline,
  printStationId,
  stationSelectionRequired = false,
  isSubmittingOrder,
  showReservationMode,
  setShowReservationMode,
  reservationAdvanceInput,
  setReservationAdvanceInput,
  reservationDate,
  setReservationDate,
  reservationTime,
  setReservationTime,
  clientName,
  setClientName,
  clientPhone,
  setClientPhone,
  selectedMethods,
  setSelectedMethods,
  methodAmounts,
  setMethodAmounts,
  handleValidateAndPrint,
  handleConfirmReservation,
}) {
  const stationMissing = stationSelectionRequired && !printStationId;
  const paymentTarget = showReservationMode ? (parseFloat(reservationAdvanceInput) || 0) : total;
  const paymentSum = selectedMethods.reduce((sum, method) => sum + (parseFloat(methodAmounts[method]) || 0), 0);
  const balance = Math.max(0, paymentTarget - paymentSum);

  const togglePaymentMethod = (method) => {
    setSelectedMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  };

  const handleAmountChange = (method, val) => {
    setMethodAmounts((prev) => ({ ...prev, [method]: val }));
  };

  const isFormValid = () => {
    if (cart.length === 0) return false;
    if (showReservationMode) {
      if (!clientName.trim() && !clientPhone.trim()) return false;
      const adv = parseFloat(reservationAdvanceInput) || 0;
      if (adv > 0 && selectedMethods.length > 1 && balance !== 0) return false;
      return true;
    }
    if (selectedMethods.length === 0) return false;
    if (selectedMethods.length > 1 && balance !== 0) return false;
    return true;
  };

  return (
    <section className="shrink-0 border-t border-neutral-200 px-4 py-4 bg-white" aria-label="Finaliser l'encaissement">
      {stationMissing && (
        <div role="alert" className="mb-3 border-l-2 border-amber-500 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
          Sélectionnez l'imprimante de ce poste dans l'en-tête avant d'imprimer.
        </div>
      )}

      {/* Mode Selector: Vente directe vs Réservation */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setShowReservationMode(false)}
          disabled={isSubmittingOrder}
          className={cx(
            'rounded border px-4 py-2 text-sm font-medium transition disabled:opacity-40',
            !showReservationMode
              ? 'border-[#b38059] bg-[#b38059] text-white'
              : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
          )}
        >
          Encaissement direct
        </button>
        <button
          type="button"
          onClick={() => setShowReservationMode(true)}
          disabled={isSubmittingOrder || cart.length === 0}
          className={cx(
            'rounded border px-4 py-2 text-sm font-medium transition disabled:opacity-40',
            showReservationMode
              ? 'border-[#b38059] bg-[#b38059] text-white'
              : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
          )}
        >
          Rendez-vous
        </button>
      </div>

      {/* Reservation Specific Inputs */}
      {showReservationMode && (
        <div className="mb-4 border-t border-neutral-200 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
            <Clock3 className="h-3.5 w-3.5 text-[#b38059]" />
            Détails du rendez-vous
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Date</span>
              <input
                type="date"
                value={reservationDate || ''}
                onChange={(e) => setReservationDate && setReservationDate(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Heure</span>
              <input
                type="time"
                value={reservationTime || ''}
                onChange={(e) => setReservationTime && setReservationTime(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Acompte (optionnel)</span>
              <input
                type="number"
                min="0"
                max={total}
                value={reservationAdvanceInput}
                onChange={(e) => setReservationAdvanceInput(e.target.value)}
                placeholder="0 FCFA"
                className={fieldCls}
              />
            </label>
          </div>
        </div>
      )}

      {/* Client Information */}
      <div className="mb-4 border-t border-neutral-200 pt-3">
        <p className="mb-2 text-sm font-medium text-neutral-900">
          Client {showReservationMode && <span className="font-normal text-neutral-400">— requis pour le RDV</span>}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ClientAutocomplete
            value={clientName}
            onChange={setClientName}
            onSelectClient={(c) => {
              setClientName(c.name);
              if (c.phone) setClientPhone(c.phone);
            }}
            placeholder="Nom ou prénom du client"
          />
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="Numéro de téléphone"
            className={fieldCls}
          />
        </div>
      </div>

      {/* Payment Methods */}
      {(!showReservationMode || (parseFloat(reservationAdvanceInput) || 0) > 0) && (
        <div className="mb-4 border-t border-neutral-200 pt-3">
          <p className="mb-2 text-sm font-medium text-neutral-900">Règlement</p>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((pm) => {
              const isSelected = selectedMethods.includes(pm.id);
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => togglePaymentMethod(pm.id)}
                  className={cx(
                    'flex-1 rounded border px-2 py-2 text-xs font-medium transition',
                    isSelected
                      ? 'border-[#b38059] bg-[#b38059]/15 text-[#825534]'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                  )}
                >
                  <span className="truncate">{pm.label}</span>
                </button>
              );
            })}
          </div>

          {/* Split Payment inputs if multiple */}
          {selectedMethods.length > 1 && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
              <div className="flex justify-between text-xs text-neutral-500">
                <span>Répartition du montant</span>
                <span>Restant : {formatFCFA(balance)}</span>
              </div>
              {selectedMethods.map((m) => {
                const label = PAYMENT_METHODS.find((p) => p.id === m)?.label || m;
                return (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-neutral-500">{label}</span>
                    <input
                      type="number"
                      min="0"
                      value={methodAmounts[m] || ''}
                      onChange={(e) => handleAmountChange(m, e.target.value)}
                      placeholder="0"
                      className={cx(fieldCls, 'py-1')}
                    />
                    <span className="shrink-0 text-xs text-neutral-400">FCFA</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Final Action Button */}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
        <div>
          <div className="text-xs text-neutral-500">Total</div>
          <div className="text-2xl font-semibold text-[#b38059]">{formatFCFA(paymentTarget)}</div>
        </div>

        {showReservationMode ? (
          <button
            type="button"
            onClick={handleConfirmReservation}
            disabled={!isFormValid() || isSubmittingOrder || !serverOnline}
            className="flex items-center gap-2 rounded border border-[#b38059] bg-[#b38059] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#9e6d47] hover:bg-[#9e6d47] disabled:opacity-40"
          >
            <Clock3 className="h-4 w-4" />
            <span>{isSubmittingOrder ? 'Enregistrement...' : 'Valider'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleValidateAndPrint}
            disabled={!isFormValid() || isSubmittingOrder || !serverOnline}
            className="flex items-center gap-2 rounded border border-[#b38059] bg-[#b38059] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#9e6d47] hover:bg-[#9e6d47] disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            <span>{isSubmittingOrder ? 'Validation...' : 'Encaisser & Imprimer'}</span>
          </button>
        )}
      </div>
    </section>
  );
}
