import React, { useState } from 'react';
import {
  FileText,
  Search,
  Calendar,
  Printer,
  Trash2,
  XCircle,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  X,
  Receipt,
  Eye,
  MapPin,
  User,
} from 'lucide-react';
import { PageHeader, EmptyState, LoadingState } from '../../components/DesignSystem';
import { formatFCFA, triggerPrint, getTodayDateStr, getPaymentMethodLabel } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';
import { useShopNames } from '../../components/ShopNamesContext';

export default function InvoicesJournalPanel({
  invoices = [],
  invoicePagination = {},
  invoicePage = 1,
  setInvoicePage,
  fetchInvoices,
  filterDate,
  setFilterDate,
  users = [],
  shopType = null,
  currentUser,
}) {
  const { shopNames } = useShopNames();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [pendingCancelInvoice, setPendingCancelInvoice] = useState(null);
  const [adminPin, setAdminPin] = useState('');
  const [cancelReason, setCancelReason] = useState('Erreur de caisse');
  const [cancelError, setCancelError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const safeInvoices = (Array.isArray(invoices) ? invoices : []).filter(
    (inv) => !shopType || (inv.shopType || 'FEMME') === shopType
  );

  const filteredInvoices = safeInvoices.filter((inv) => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (methodFilter !== 'ALL' && !String(inv.paymentMethod || '').includes(methodFilter)) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const invNo = String(inv.invoiceNumber || '').toLowerCase();
    const client = String(inv.clientName || '').toLowerCase();
    const cashier = String(inv.createdBy?.name || '').toLowerCase();
    return invNo.includes(term) || client.includes(term) || cashier.includes(term);
  });

  const handleCancelInvoice = async () => {
    if (!pendingCancelInvoice || !adminPin.trim()) {
      setCancelError('Le code PIN administrateur est obligatoire.');
      return;
    }
    setSubmitting(true);
    setCancelError('');
    try {
      const res = await fetch(`${API_BASE}/invoices/${pendingCancelInvoice.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin.trim(),
        },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        setPendingCancelInvoice(null);
        setAdminPin('');
        if (typeof fetchInvoices === 'function') {
          fetchInvoices();
        }
        window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      } else {
        const data = await res.json().catch(() => ({}));
        setCancelError(data.error || 'Code PIN administrateur invalide.');
      }
    } catch {
      setCancelError('Erreur de communication avec le serveur.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 bg-white pb-12">
      <PageHeader
        eyebrow="JOURNAL DES TRANSACTIONS"
        title="Journal des Factures & Tickets"
        description="Historique complet des tickets de caisse émis, vérification des règlements, réimpression thermique et annulations sécurisées."
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Rechercher par N° ticket, client ou caissier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-900 outline-none focus:border-[#b38059]"
            />
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-1.5 text-xs text-neutral-600">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            <input
              type="date"
              value={filterDate || ''}
              onChange={(e) => setFilterDate && setFilterDate(e.target.value)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 outline-none focus:border-[#b38059]"
            />
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate && setFilterDate('')}
                className="text-[11px] text-neutral-400 hover:text-neutral-700 underline"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 outline-none focus:border-[#b38059]"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="VALIDATED">Validés uniquement</option>
            <option value="CANCELLED">Annulés uniquement</option>
          </select>

          {/* Payment Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 outline-none focus:border-[#b38059]"
          >
            <option value="ALL">Tous les règlements</option>
            <option value="CASH">Espèces</option>
            <option value="ORANGE">Orange Money</option>
            <option value="ONLINE">Mobile Money / Wave</option>
          </select>
        </div>

        <div className="text-xs font-semibold text-neutral-500">
          {filteredInvoices.length} résultat{filteredInvoices.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Invoices Table */}
      {filteredInvoices.length === 0 ? (
        <EmptyState
          title="Aucun ticket trouvé"
          description="Aucune facture ne correspond à vos filtres de recherche."
          className="py-12"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 text-neutral-600 font-semibold">
                <th className="py-2.5 px-3">N° Ticket</th>
                <th className="py-2.5 px-3">Date & Heure</th>
                <th className="py-2.5 px-3">Client</th>
                <th className="py-2.5 px-3">Opérateur</th>
                <th className="py-2.5 px-3">Établissement</th>
                <th className="py-2.5 px-3">Moyen de Paiement</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3 text-right">Montant</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredInvoices.map((inv) => {
                const isValidated = inv.status === 'VALIDATED';
                const isCancelled = inv.status === 'CANCELLED';
                const isHomme = inv.shopType === 'HOMME';

                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedInvoice(inv)}
                    className="hover:bg-[#faf7f4] transition cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {inv.createdAt
                        ? new Date(inv.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '--'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-neutral-900">
                      {inv.clientName || 'Client de passage'}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600">
                      {inv.createdBy?.name || 'Caissier'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          isHomme ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {isHomme ? shopNames.HOMME : shopNames.FEMME}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 font-mono text-[11px]">
                      {inv.paymentMethod}
                    </td>
                    <td className="py-2.5 px-3">
                      {isValidated && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Payé
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          <XCircle className="h-3 w-3" /> Annulé
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#b38059]">
                      {formatFCFA(inv.totalAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="rounded p-1 text-neutral-400 hover:bg-[#b38059]/15 hover:text-[#825534] transition"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerPrint(inv)}
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition"
                          title="Réimprimer le ticket"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {isValidated && (
                          <button
                            type="button"
                            onClick={() => {
                              setPendingCancelInvoice(inv);
                              setAdminPin('');
                              setCancelError('');
                            }}
                            className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Annuler ce ticket (PIN requis)"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Detail Drawer */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-neutral-900/30 cursor-pointer"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="w-full max-w-md bg-white border-l border-neutral-200 h-full flex flex-col overflow-hidden cursor-default shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 shrink-0 bg-[#faf7f4]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#b38059]/15">
                  <Receipt className="h-4 w-4 text-[#825534]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#b38059]">{selectedInvoice.invoiceNumber}</div>
                  <div className="text-[11px] text-neutral-500">Détails de la facture</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Meta info */}
              <div className="space-y-2 text-xs border-b border-neutral-100 pb-5">
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Date &amp; Heure</span>
                  <span className="font-medium text-neutral-900">
                    {selectedInvoice.createdAt
                      ? new Date(selectedInvoice.createdAt).toLocaleString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })
                      : '--'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Caissier</span>
                  <span className="font-medium text-neutral-900">
                    {selectedInvoice.createdBy?.name || 'Caissier'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Client</span>
                  <span className="font-semibold text-[#b38059]">
                    {selectedInvoice.clientName || 'Client de passage'}
                  </span>
                </div>
                {selectedInvoice.clientPhone && (
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Téléphone</span>
                    <span className="font-medium text-neutral-900">{selectedInvoice.clientPhone}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Établissement</span>
                  <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${
                    selectedInvoice.shopType === 'HOMME'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-neutral-100 text-neutral-800'
                  }`}>
                    {selectedInvoice.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Mode de paiement</span>
                  <span className="font-semibold text-emerald-700">
                    {getPaymentMethodLabel(selectedInvoice.paymentMethod)}
                  </span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-neutral-500">Statut</span>
                  {selectedInvoice.status === 'VALIDATED' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Validée
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      <XCircle className="h-3 w-3" /> Annulée
                    </span>
                  )}
                </div>
                {selectedInvoice.status === 'CANCELLED' && selectedInvoice.cancellationReason && (
                  <div className="rounded bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                    <span className="font-semibold">Motif :</span> {selectedInvoice.cancellationReason}
                  </div>
                )}

                {/* Reservation badge */}
                {selectedInvoice.isReservation && selectedInvoice.reservationNo && (
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Réservation N°</span>
                    <span className="font-semibold text-[#b38059]">{selectedInvoice.reservationNo}</span>
                  </div>
                )}

                {/* Delivery info */}
                {selectedInvoice.isDelivery && (
                  <>
                    {selectedInvoice.deliveryAddress && (
                      <div className="flex justify-between py-1 items-start gap-2">
                        <span className="text-neutral-500 shrink-0">Adresse livraison</span>
                        <span className="font-medium text-neutral-900 text-right">{selectedInvoice.deliveryAddress}</span>
                      </div>
                    )}
                    {selectedInvoice.deliveryPerson && (
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Livreur</span>
                        <span className="font-medium text-neutral-900">{selectedInvoice.deliveryPerson}</span>
                      </div>
                    )}
                    {selectedInvoice.deliveryFee != null && (
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Frais de livraison</span>
                        <span className="font-medium text-neutral-900">{formatFCFA(selectedInvoice.deliveryFee)}</span>
                      </div>
                    )}
                    {selectedInvoice.deliveryStatus && (
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Statut livraison</span>
                        <span className="font-medium text-neutral-900">{selectedInvoice.deliveryStatus}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Prestations &amp; Produits
                </div>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-neutral-200 text-neutral-500 font-semibold">
                    <tr>
                      <th className="py-2 pr-2">Désignation</th>
                      <th className="py-2 text-center w-10">Qté</th>
                      <th className="py-2 text-right w-20">P/U</th>
                      <th className="py-2 text-right w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(selectedInvoice.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-neutral-400 italic">
                          Aucun article enregistré
                        </td>
                      </tr>
                    ) : (
                      (selectedInvoice.items || []).map((item, idx) => {
                        const qty = Number(item.qty || 1);
                        const price = Number(item.price || 0);
                        return (
                          <tr key={idx}>
                            <td className="py-2 pr-2 text-neutral-900 leading-snug">
                              {item.categoryName || item.name || '—'}
                            </td>
                            <td className="py-2 text-center text-neutral-500">{qty}</td>
                            <td className="py-2 text-right text-neutral-500">{formatFCFA(price)}</td>
                            <td className="py-2 text-right font-bold text-[#b38059]">{formatFCFA(price * qty)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Box */}
              <div className="rounded-lg bg-[#faf7f4] border border-[#b38059]/30 px-4 py-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-600">Montant Total Réglé</div>
                <div className="text-lg font-bold text-[#b38059] tabular-nums">
                  {formatFCFA(selectedInvoice.totalAmount)}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-neutral-200 px-6 py-4 shrink-0 space-y-2 bg-white">
              <button
                type="button"
                onClick={() => triggerPrint(selectedInvoice)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#b38059] hover:bg-[#9d6f4b] py-2.5 text-xs font-semibold text-white transition"
              >
                <Printer className="h-4 w-4" />
                Réimprimer ce ticket
              </button>
              {selectedInvoice.status === 'VALIDATED' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInvoice(null);
                    setPendingCancelInvoice(selectedInvoice);
                    setAdminPin('');
                    setCancelError('');
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 py-2.5 text-xs font-semibold text-rose-700 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Annuler cette facture
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal with PIN */}
      {pendingCancelInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-neutral-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">Annulation de Facture</h3>
                <p className="text-xs text-neutral-500">
                  Ticket N° {pendingCancelInvoice.invoiceNumber} – {formatFCFA(pendingCancelInvoice.totalAmount)}
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 mb-4">
              Cette action retirera le ticket du chiffre d'affaires et conservera la trace de l'annulation.
            </p>

            {cancelError && (
              <div className="mb-3 rounded bg-rose-50 p-2.5 text-xs text-rose-700">
                {cancelError}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Motif de l'annulation
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded border border-neutral-300 bg-white p-2 text-xs text-neutral-900 outline-none focus:border-rose-500"
                >
                  <option value="Erreur de caisse">Erreur de saisie / caisse</option>
                  <option value="Client insatisfait / Modification">Demande de modification client</option>
                  <option value="Doublon de ticket">Ticket émis en doublon</option>
                  <option value="Autre motif">Autre motif exceptionnel</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Code PIN Administrateur
                </label>
                <input
                  type="password"
                  placeholder="Entrez le code PIN..."
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-full rounded border border-neutral-300 bg-white p-2 text-xs text-neutral-900 outline-none focus:border-rose-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCancelInvoice(null)}
                className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCancelInvoice}
                disabled={submitting || !adminPin.trim()}
                className="rounded bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? 'Validation...' : 'Confirmer l’annulation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
