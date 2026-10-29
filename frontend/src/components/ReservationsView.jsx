import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Phone, Plus, Scissors, CheckCircle, XCircle, Printer, AlertCircle, Eye, CreditCard } from 'lucide-react';
import Field, { inputCls } from './Field';
import ClientAutocomplete from './ClientAutocomplete';
import { formatFCFA, triggerPrint, triggerProformaPrint, triggerFinalReservationPrint, getTodayDateStr, cx, showToast } from '../utils/helpers';
import { API_BASE } from '../utils/constants';

export default function ReservationsView({ categories = [], currentUser, serverOnline, printStationId, onTransferToCart }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateStr());
  const [monthReservations, setMonthReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // New Reservation Form State
  const [formClientName, setFormClientName] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formServiceName, setFormServiceName] = useState('');
  const [formDate, setFormDate] = useState(() => getTodayDateStr());
  const [formTime, setFormTime] = useState('14:00');
  const [formShopType, setFormShopType] = useState('FEMME');
  const [formAmount, setFormAmount] = useState('');
  const [formAdvance, setFormAdvance] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('CASH');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load reservations for the current displayed month
  const fetchMonthReservations = async () => {
    setLoading(true);
    setError('');
    try {
      const year = currentMonth.getFullYear();
      const monthStr = String(currentMonth.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${monthStr}`;
      const res = await fetch(`${API_BASE}/reservations?month=${monthKey}`);
      if (res.ok) {
        const data = await res.json();
        setMonthReservations(Array.isArray(data) ? data : []);
      } else {
        setError('Impossible de charger les réservations du mois.');
      }
    } catch {
      setError('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthReservations();
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getTodayDateStr());
  };

  // Calendar matrix calculation
  const getDaysMatrix = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday as first day of week (0: Monday ... 6: Sunday)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const d = new Date(year, month - 1, dayNum);
      days.push({ date: d, isCurrentMonth: false, dateStr: getTodayDateStr(d) });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, dateStr: getTodayDateStr(d) });
    }

    // Next month padding to fill rows
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, dateStr: getTodayDateStr(d) });
    }

    return days;
  };

  // Group reservations by dateStr
  const reservationsByDate = {};
  monthReservations.forEach((res) => {
    const dStr = res.scheduledAt
      ? res.scheduledAt.slice(0, 10)
      : res.createdAt
      ? res.createdAt.slice(0, 10)
      : '';
    if (dStr) {
      if (!reservationsByDate[dStr]) reservationsByDate[dStr] = [];
      reservationsByDate[dStr].push(res);
    }
  });

  // Selected date reservations
  const selectedDayReservations = (reservationsByDate[selectedDate] || []).filter((r) => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    if (!formClientName.trim() && !formClientPhone.trim()) {
      showToast('Le nom ou téléphone du client est requis.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const scheduledAt = `${formDate}T${formTime || '12:00'}:00`;
      const amount = parseFloat(formAmount) || 0;
      const advance = parseFloat(formAdvance) || 0;

      const body = {
        clientName: formClientName.trim(),
        clientPhone: formClientPhone.trim(),
        scheduledAt,
        bookingTime: formTime,
        serviceName: formServiceName || 'Prestation salon',
        shopType: formShopType,
        totalAmount: amount,
        advanceAmount: advance,
        notes: formNotes,
        createdById: currentUser?.id,
        initialPayment: advance > 0 ? { amount: advance, paymentMethod: formPaymentMethod } : null,
        stationId: printStationId || undefined,
      };

      const res = await fetch(`${API_BASE}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast('Rendez-vous enregistré avec succès !', 'success');
        setShowAddModal(false);
        setFormClientName('');
        setFormClientPhone('');
        setFormServiceName('');
        setFormAmount('');
        setFormAdvance('');
        setFormNotes('');
        fetchMonthReservations();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Erreur lors de la réservation', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (resId) => {
    if (!window.confirm('Confirmer l’annulation de ce rendez-vous ?')) return;
    try {
      const res = await fetch(`${API_BASE}/reservations/${resId}/cancel`, { method: 'POST' });
      if (res.ok) {
        showToast('Rendez-vous annulé.', 'success');
        fetchMonthReservations();
      } else {
        showToast('Erreur lors de l’annulation.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    }
  };

  const handlePrintAcompte = (reservation) => {
    triggerProformaPrint(reservation, printStationId);
  };

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  return (
    <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[1.1fr_1fr] overflow-hidden bg-white">
      {/* LEFT: Calendrier Visuel Interactif */}
      <section className="flex flex-col min-h-0 bg-white p-4 sm:p-5 border-r border-neutral-200">
        {/* Navigation Mois */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-bold text-neutral-900 capitalize">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToday}
              className="rounded border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
            >
              Aujourd'hui
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mois précédent"
              className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 hover:text-neutral-900 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Mois suivant"
              className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 hover:text-neutral-900 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-500 mb-2">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mer</span>
          <span>Jeu</span>
          <span>Ven</span>
          <span>Sam</span>
          <span>Dim</span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 min-h-0 flex-1 overflow-y-auto">
          {getDaysMatrix().map((dObj, idx) => {
            const count = (reservationsByDate[dObj.dateStr] || []).length;
            const isSelected = selectedDate === dObj.dateStr;
            const isToday = dObj.dateStr === getTodayDateStr();

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(dObj.dateStr)}
                className={cx(
                  'relative flex flex-col items-center justify-between p-1.5 transition text-left min-h-[64px] cursor-pointer border-b border-r border-neutral-200',
                  !dObj.isCurrentMonth && 'opacity-35',
                  isSelected
                    ? 'bg-[#b38059]/15'
                    : 'bg-white hover:bg-neutral-50'
                )}
              >
                <span
                  className={cx(
                    'flex h-5 w-5 items-center justify-center text-xs',
                    isToday ? 'bg-[#b38059] text-white rounded font-bold' : isSelected ? 'text-[#825534] font-bold' : 'text-neutral-900'
                  )}
                >
                  {dObj.date.getDate()}
                </span>

                {count > 0 ? (
                  <span className="text-[11px] font-bold text-[#b38059]">
                    {count} RDV
                  </span>
                ) : (
                  <span className="h-4" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-neutral-200 text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 bg-[#b38059]" />
              <span>Jour avec RDV</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 border border-[#b38059] bg-transparent" />
              <span>Aujourd'hui</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormDate(selectedDate);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9d6f4b] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nouveau RDV</span>
          </button>
        </div>
      </section>

      {/* RIGHT: Rendez-vous du jour sélectionné */}
      <section className="flex flex-col min-h-0 bg-white p-4 sm:p-5">
        {/* Header Jour */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">
              Planning du {new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
            <p className="text-xs text-neutral-500">
              {selectedDayReservations.length} {selectedDayReservations.length <= 1 ? 'rendez-vous prévu' : 'rendez-vous prévus'}
            </p>
          </div>

          {/* Filter Status */}
          <div className="flex items-center text-xs">
            {['ALL', 'PENDING', 'COMPLETED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={cx(
                  'px-2.5 py-1 text-xs font-medium cursor-pointer',
                  statusFilter === st ? 'bg-[#b38059]/15 text-[#825534] font-bold' : 'text-neutral-500 hover:text-neutral-900'
                )}
              >
                {st === 'ALL' ? 'Tous' : st === 'PENDING' ? 'En attente' : 'Honoré'}
              </button>
            ))}
          </div>
        </div>

        {/* Appointments List */}
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-neutral-200">
          {selectedDayReservations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center text-neutral-500">
              <CalendarIcon className="h-6 w-6 text-neutral-400 mb-2" />
              <p className="text-xs font-bold text-neutral-900">Aucun rendez-vous ce jour</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                Cliquez sur le bouton ci-dessous pour planifier une prestation avec un client.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFormDate(selectedDate);
                  setShowAddModal(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#825534] hover:text-neutral-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter pour cette date</span>
              </button>
            </div>
          ) : (
            selectedDayReservations.map((r) => {
              const isCompleted = r.status === 'COMPLETED';
              const isCancelled = r.status === 'CANCELLED';
              const totalAmount = parseFloat(r.totalAmount) || 0;
              const totalPaid = parseFloat(r.totalPaid) || parseFloat(r.advanceAmount) || 0;
              const remaining = Math.max(0, totalAmount - totalPaid);

              return (
                <div
                  key={r.id}
                  className={cx(
                    'py-3.5 space-y-2',
                    isCancelled && 'opacity-50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs font-medium text-neutral-900">
                          <Clock className="h-3 w-3 text-neutral-400" />
                          {r.bookingTime || (r.scheduledAt ? r.scheduledAt.slice(11, 16) : '--:--')}
                        </span>
                        <h3 className="text-xs font-bold text-neutral-900">{r.clientName}</h3>
                        {r.shopType && (
                          <span className="text-xs text-neutral-500">
                            ({r.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'})
                          </span>
                        )}
                      </div>
                      {r.clientPhone && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                          <Phone className="h-3 w-3 text-emerald-600" />
                          <span>{r.clientPhone}</span>
                        </p>
                      )}
                    </div>

                    {/* Status Badge */}
                    <span
                      className={cx(
                        'text-xs font-medium',
                        isCompleted
                          ? 'text-emerald-700'
                          : isCancelled
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      )}
                    >
                      {isCompleted ? 'Honoré' : isCancelled ? 'Annulé' : 'En attente'}
                    </span>
                  </div>

                  {/* Prestation / Service */}
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="font-medium text-neutral-900 truncate flex-1">
                      {r.serviceName || (r.items && r.items[0] ? r.items[0].categoryName : 'Prestation salon')}
                    </span>
                    <span className="font-bold text-[#b38059] shrink-0 ml-2">
                      {formatFCFA(totalAmount)}
                    </span>
                  </div>

                  {/* Financials & Acompte */}
                  {totalPaid > 0 && (
                    <div className="flex items-center justify-between text-xs text-neutral-500 font-medium">
                      <span>Acompte versé : <strong className="text-emerald-700">{formatFCFA(totalPaid)}</strong></span>
                      <span>Solde restant : <strong className="text-[#b38059]">{formatFCFA(remaining)}</strong></span>
                    </div>
                  )}

                  {/* Actions */}
                  {!isCancelled && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {totalPaid > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePrintAcompte(r)}
                          className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5 text-neutral-500" />
                          <span>Reçu acompte</span>
                        </button>
                      )}

                      {!isCompleted && onTransferToCart && (
                        <button
                          type="button"
                          onClick={() => onTransferToCart(r)}
                          className="inline-flex items-center gap-1 rounded bg-[#b38059] hover:bg-[#9d6f4b] px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                          <span>Encaisser en caisse</span>
                        </button>
                      )}

                      {!isCompleted && (
                        <button
                          type="button"
                          onClick={() => handleCancel(r.id)}
                          className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-neutral-50 cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Annuler</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* MODAL: Nouveau Rendez-vous */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4">
          <div className="w-full max-w-lg rounded border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-[#b38059]" />
                <h3 className="text-sm font-bold text-neutral-900">Nouveau Rendez-vous</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom du client" required>
                  <ClientAutocomplete
                    value={formClientName}
                    onChange={setFormClientName}
                    onSelectClient={(c) => {
                      setFormClientName(c.name);
                      if (c.phone) setFormClientPhone(c.phone);
                    }}
                    placeholder="Nom du client"
                    className={inputCls}
                  />
                </Field>
                <Field label="Téléphone">
                  <input
                    type="tel"
                    value={formClientPhone}
                    onChange={(e) => setFormClientPhone(e.target.value)}
                    placeholder="Ex: 699 00 00 00"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Shop">
                  <select
                    value={formShopType}
                    onChange={(e) => setFormShopType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="FEMME">Shop 2</option>
                    <option value="HOMME">Shop 1</option>
                    <option value="ALL">Mixte / Tous</option>
                  </select>
                </Field>
                <Field label="Prestation / Service" required>
                  <input
                    type="text"
                    value={formServiceName}
                    onChange={(e) => setFormServiceName(e.target.value)}
                    placeholder="Ex: Tresses, Dégradé, Soin visage..."
                    className={inputCls}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date du rendez-vous" required>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className={inputCls}
                    required
                  />
                </Field>
                <Field label="Heure du rendez-vous" required>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className={inputCls}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Montant total estimé (FCFA)">
                  <input
                    type="number"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </Field>
                <Field label="Acompte versé (optionnel)">
                  <input
                    type="number"
                    min="0"
                    value={formAdvance}
                    onChange={(e) => setFormAdvance(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </Field>
              </div>

              {parseFloat(formAdvance) > 0 && (
                <Field label="Mode de règlement de l'acompte">
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className={inputCls}
                  >
                    <option value="CASH">Espèces</option>
                    <option value="ONLINE">Mobile Money</option>
                    <option value="ORANGE_MONEY">Orange Money</option>
                  </select>
                </Field>
              )}

              <Field label="Notes / Précisions">
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Demande coiffeuse Sarah, mèches fournies..."
                  className={inputCls}
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded border border-neutral-200 bg-white hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-medium text-neutral-900 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-[#b38059] hover:bg-[#9d6f4b] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-45 cursor-pointer"
                >
                  {submitting ? 'Enregistrement...' : 'Confirmer le rendez-vous'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}