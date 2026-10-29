import React, { useState, useEffect } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { EmptyState, LoadingState } from '../../components/DesignSystem';
import { formatFCFA, getTodayDateStr, triggerProformaPrint, cx, showToast, formatScheduledAt } from '../../utils/helpers';
import { RotateCcw, Calendar, Printer, Trash2, XCircle } from 'lucide-react';

export default function ReservationsPanel({
  reservations = [],
  loading = false,
  users = [],
  filterDate,
  setFilterDate,
  filterCashier,
  setFilterCashier,
  selectedReservationId,
  setSelectedReservationId,
  onRefresh,
  shopType = null,
}) {
  const [reservationStatusFilter, setReservationStatusFilter] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const handleCancelReservation = async () => {
    const resId = cancelTargetId;
    if (!resId) return;

    setIsCancelling(true);
    try {
      const { API_BASE } = await import('../../utils/constants');
      const response = await fetch(`${API_BASE}/reservations/${resId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        showToast('Réservation annulée avec succès.', 'success');
        setSelectedReservationId(null);
        if (onRefresh) onRefresh();
        window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error || 'Erreur lors de l\'annulation de la réservation.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erreur réseau', 'error');
    } finally {
      setIsCancelling(false);
      setCancelTargetId(null);
    }
  };

  const handleDeleteReservation = async () => {
    const resId = deleteTargetId;
    if (!resId) return;

    setIsCancelling(true);
    try {
      const { API_BASE } = await import('../../utils/constants');
      const response = await fetch(`${API_BASE}/reservations/${resId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        showToast('Réservation supprimée définitivement.', 'success');
        setSelectedReservationId(null);
        if (onRefresh) onRefresh();
        window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.error || 'Erreur lors de la suppression de la réservation.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erreur réseau', 'error');
    } finally {
      setIsCancelling(false);
      setDeleteTargetId(null);
    }
  };

  const todayStr = getTodayDateStr();

  const safeReservations = (Array.isArray(reservations) ? reservations : []).filter((reservation) => !shopType || (reservation.shopType || 'FEMME') === shopType);
  const safeUsers = Array.isArray(users) ? users : [];

  const filteredReservations = safeReservations.filter(res => {
    if (!reservationStatusFilter) return true;
    return res.status === reservationStatusFilter;
  });

  // Calculations for Synthèse des Réservations
  const activeReservations = safeReservations.filter(r => r.status !== 'CANCELLED');
  const resTotalValue = activeReservations.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
  const resTotalPaid = activeReservations.reduce((sum, r) => {
    const paid = r.totalPaid !== undefined 
      ? Number(r.totalPaid || 0)
      : (r.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return sum + paid;
  }, 0);
  const resTotalRemaining = activeReservations.reduce((sum, r) => {
    const paid = r.totalPaid !== undefined 
      ? Number(r.totalPaid || 0)
      : (r.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = Number(r.totalAmount || 0);
    return sum + Math.max(0, total - paid);
  }, 0);

  const selectedReservation = filteredReservations.find(res => res.id === selectedReservationId) || safeReservations.find(res => res.id === selectedReservationId) || null;

  useEffect(() => {
    if (selectedReservationId && !filteredReservations.some(res => res.id === selectedReservationId)) {
      setSelectedReservationId(null);
    }
  }, [filteredReservations, selectedReservationId]);

  const handleDateChange = (value) => {
    setFilterDate(value);
  };

  const handleCashierChange = (value) => {
    setFilterCashier(value);
  };

  const isFiltered = filterDate || filterCashier;

  const formatFilterDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <section className="space-y-6 bg-white">
      {/* Filters Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Opérateur :</label>
            <select
              value={filterCashier || ''}
              onChange={(e) => handleCashierChange(e.target.value)}
              className="border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
            >
              <option value="">Tous les opérateurs</option>
              {safeUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Date :</label>
            <input
              type="date"
              value={filterDate || ''}
              onChange={(e) => handleDateChange(e.target.value)}
              className="border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDateChange(todayStr)}
              className={cx(
                'rounded border px-3 py-1 text-xs transition font-medium',
                filterDate === todayStr
                  ? 'border-[#b38059] bg-[#b38059] text-white'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
              )}
            >
              <Calendar className="inline h-3.5 w-3.5 mr-1" />
              <span>Aujourd'hui</span>
            </button>

            {filterDate && (
              <button
                type="button"
                onClick={() => handleDateChange('')}
                className="rounded border border-neutral-200 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400"
              >
                <RotateCcw className="inline h-3 w-3 mr-1" />
                <span>Toutes les dates</span>
              </button>
            )}
          </div>
        </div>

        {isFiltered && (
          <div className="text-xs text-[#b38059]">
            Filtre : {filterDate ? formatFilterDate(filterDate) : 'Toutes dates'} {filterCashier ? `| Opérateur : ${safeUsers.find(u => u.id === filterCashier)?.name || 'Sélectionné'}` : ''}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!cancelTargetId}
        title="Annuler la réservation"
        message="Êtes-vous sûr de vouloir annuler définitivement cette réservation ? Action irréversible."
        onConfirm={handleCancelReservation}
        onCancel={() => setCancelTargetId(null)}
      />

      <ConfirmModal
        open={!!deleteTargetId}
        title="Supprimer la réservation"
        message="Êtes-vous sûr de vouloir supprimer définitivement cette réservation de la base de données ?"
        onConfirm={handleDeleteReservation}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Synthèse des Réservations Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="text-xs text-neutral-500">Valeur Totale Réservée</div>
          <div className="text-xl font-semibold text-neutral-900 mt-0.5">{formatFCFA(resTotalValue)}</div>
          <div className="text-xs text-neutral-400 mt-0.5">{activeReservations.length} réservations actives</div>
        </div>

        <div>
          <div className="text-xs text-neutral-500">Acomptes Perçus</div>
          <div className="text-xl font-semibold text-neutral-900 mt-0.5">{formatFCFA(resTotalPaid)}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Montant en caisse</div>
        </div>

        <div>
          <div className="text-xs text-neutral-500">Solde Restant Dû</div>
          <div className="text-xl font-semibold text-[#b38059] mt-0.5">{formatFCFA(resTotalRemaining)}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Reste à percevoir</div>
        </div>
      </div>

      {/* Reservations Table Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-sm font-semibold text-neutral-900">Liste des Réservations</h3>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReservationStatusFilter('')}
              className={cx(
                'rounded border px-2.5 py-1 text-xs font-medium transition',
                !reservationStatusFilter
                  ? 'border-[#b38059] bg-[#b38059]/15 text-[#825534]'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
              )}
            >
              Toutes
            </button>
            <button
              type="button"
              onClick={() => setReservationStatusFilter('PENDING')}
              className={cx(
                'rounded border px-2.5 py-1 text-xs font-medium transition',
                reservationStatusFilter === 'PENDING'
                  ? 'border-[#b38059] bg-[#b38059]/15 text-[#825534]'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
              )}
            >
              En attente
            </button>
            <button
              type="button"
              onClick={() => setReservationStatusFilter('COMPLETED')}
              className={cx(
                'rounded border px-2.5 py-1 text-xs font-medium transition',
                reservationStatusFilter === 'COMPLETED'
                  ? 'border-[#b38059] bg-[#b38059]/15 text-[#825534]'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
              )}
            >
              Honorées
            </button>
          </div>
        </div>

        <div className={cx('flex gap-6 transition-all duration-200', selectedReservation ? 'items-start' : '')}>
          <div className={cx('overflow-x-auto transition-all duration-200', selectedReservation ? 'flex-1 min-w-0' : 'w-full')}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="py-2 pr-2 font-normal">Réf / Prestation</th>
                  <th className="py-2 px-2 font-normal">Client</th>
                  <th className="py-2 px-2 font-normal">Rendez-vous</th>
                  <th className="py-2 px-2 font-normal">Shop</th>
                  <th className="py-2 px-2 text-right font-normal">Total</th>
                  <th className="py-2 px-2 text-right font-normal">Acompte</th>
                  <th className="py-2 pl-2 font-normal">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr><td colSpan={7} className="py-8"><LoadingState label="Chargement des réservations..." rows={3} className="border-0 bg-transparent" /></td></tr>
                ) : filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8">
                      <EmptyState title="Aucune réservation" description="Aucune réservation ne correspond aux critères." className="border-0 bg-transparent" />
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map(res => {
                    const totalPaid = (res.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                    return (
                      <tr
                        key={res.id}
                        onClick={() => setSelectedReservationId(prev => prev === res.id ? null : res.id)}
                        className={cx('cursor-pointer transition hover:bg-neutral-50', selectedReservationId === res.id ? 'bg-neutral-100' : '')}
                      >
                        <td className="py-2.5 pr-2">
                          <div className="font-semibold text-[#b38059]">{res.reservationNo}</div>
                          <div className="text-neutral-900 font-medium">{res.serviceName || 'Prestation salon'}</div>
                        </td>
                        <td className="py-2.5 px-2 text-neutral-900 font-medium">
                          <div>{res.clientName || 'Client'}</div>
                          {res.clientPhone && <div className="text-neutral-400 font-normal">{res.clientPhone}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-neutral-700">
                          <div>{formatScheduledAt(res.scheduledAt) || new Date(res.createdAt).toLocaleDateString('fr-FR')}</div>
                          {res.bookingTime && <div className="text-neutral-400">{res.bookingTime}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-neutral-500">
                          {res.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-neutral-900">{formatFCFA(res.totalAmount)}</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-[#b38059]">{formatFCFA(totalPaid)}</td>
                        <td className="py-2.5 pl-2">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-neutral-600">
                              {res.status === 'COMPLETED' ? 'Honorée' : res.status === 'CANCELLED' ? 'Annulée' : 'En attente'}
                            </span>
                            
                            {res.status === 'CANCELLED' ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTargetId(res.id)}
                                className="text-neutral-400 hover:text-red-600 transition"
                                title="Supprimer définitivement"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCancelTargetId(res.id)}
                                className="text-neutral-400 hover:text-red-600 transition"
                                title="Annuler la réservation"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => triggerProformaPrint(res)}
                              className="text-neutral-400 hover:text-neutral-900 transition"
                              title="Réimprimer le reçu"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {selectedReservation && (
            <aside className="w-80 shrink-0 border-l border-neutral-200 pl-6 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <div className="font-semibold text-sm text-neutral-900">Détails du Rendez-vous</div>
                <button type="button" onClick={() => setSelectedReservationId(null)} className="text-neutral-400 hover:text-neutral-900">
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-2 text-neutral-700">
                  <div className="flex justify-between"><span>Référence :</span><strong className="text-[#b38059]">{selectedReservation.reservationNo}</strong></div>
                  <div className="flex justify-between"><span>Prestation :</span><strong className="text-neutral-900">{selectedReservation.serviceName || 'Prestation salon'}</strong></div>
                  <div className="flex justify-between"><span>Rendez-vous :</span><strong>{formatScheduledAt(selectedReservation.scheduledAt)}</strong></div>
                  <div className="flex justify-between"><span>Shop :</span><strong>{selectedReservation.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}</strong></div>
                  <div className="flex justify-between"><span>Client :</span><strong>{selectedReservation.clientName || 'Client anonyme'}</strong></div>
                  <div className="flex justify-between"><span>Téléphone :</span><strong>{selectedReservation.clientPhone || '—'}</strong></div>
                  <div className="border-t border-neutral-200 pt-2 flex justify-between font-semibold"><span>Total :</span><strong className="text-[#b38059]">{formatFCFA(selectedReservation.totalAmount)}</strong></div>
                  <div className="flex justify-between"><span>Acompte versé :</span><strong className="text-neutral-900">{formatFCFA((selectedReservation.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0))}</strong></div>
                  <div className="flex justify-between"><span>Solde restant :</span><strong className="text-[#b38059]">{formatFCFA(selectedReservation.remainingBalance || 0)}</strong></div>
                </div>

                <div className="border-t border-neutral-200 pt-3">
                  <div className="mb-2 text-neutral-500 font-medium">Historique des acomptes</div>
                  <div className="space-y-2">
                    {(selectedReservation.payments || []).length === 0 ? (
                      <div className="text-neutral-400 italic">Aucun acompte enregistré.</div>
                    ) : (
                      (selectedReservation.payments || []).map(payment => (
                        <div key={payment.id} className="flex items-center justify-between border-b border-neutral-100 pb-1.5">
                          <div>
                            <span className="font-medium text-neutral-900">{payment.paymentMethod || 'CASH'}</span>
                            <div className="text-[10px] text-neutral-400">{new Date(payment.createdAt).toLocaleDateString('fr-FR')}</div>
                          </div>
                          <span className="font-semibold text-[#b38059]">{formatFCFA(payment.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {selectedReservation.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    onClick={() => setCancelTargetId(selectedReservation.id)}
                    disabled={isCancelling}
                    className="w-full rounded border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400 disabled:opacity-40"
                  >
                    {isCancelling ? 'Annulation...' : 'Annuler ce rendez-vous'}
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}