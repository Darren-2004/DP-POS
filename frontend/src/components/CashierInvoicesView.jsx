import React, { useState, useEffect } from 'react';
import { Search, Printer, Eye, X, Receipt, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { inputCls } from './Field';
import StatusChip from './StatusChip';
import { formatFCFA, triggerPrint, getPaymentMethodLabel, getTodayDateStr, cx, isReservationInvoice } from '../utils/helpers';
import { API_BASE } from '../utils/constants';
import { EmptyState, ErrorState, LoadingState } from './DesignSystem';

export default function CashierInvoicesView({ currentUser }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  
  // Date and status filters
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const [selectedStatus, setSelectedStatus] = useState('VALIDATED');

  useEffect(() => {
    if (currentUser?.id) {
      fetchCashierInvoices();
    }
  }, [currentUser?.id, selectedDate, selectedStatus]);

  useEffect(() => {
    const handleRefresh = () => fetchCashierInvoices();
    window.addEventListener('pos:dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('pos:dashboard-refresh', handleRefresh);
  }, [currentUser?.id, selectedDate, selectedStatus]);

  const fetchCashierInvoices = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      let url = `${API_BASE}/invoices?cashierId=${currentUser.id}`;
      if (selectedDate) {
        url += `&date=${selectedDate}`;
      }
      if (selectedStatus && selectedStatus !== 'all') {
        url += `&status=${selectedStatus}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setInvoices(Array.isArray(data) ? data : []);
      } else setLoadError('Impossible de charger les tickets de cette période.');
    } catch (e) {
      console.error('Fetch cashier invoices error:', e);
      setLoadError('Erreur réseau lors du chargement des tickets.');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const invNo = (inv.invoiceNumber || '').toLowerCase();
    const client = (inv.clientName || '').toLowerCase();
    return invNo.includes(q) || client.includes(q);
  });

  const validatedInvoices = invoices.filter(inv => inv.status === 'VALIDATED');
  const totalSalesRevenue = validatedInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const cancelledCount = invoices.filter(inv => inv.status === 'CANCELLED').length;

  const groupInvoiceItems = (items = []) => {
    const map = {};
    items.forEach(item => {
      const key = `${item.categoryName}||${item.price}`;
      const qty = Number(item.qty || 1);
      if (!map[key]) {
        map[key] = { categoryName: item.categoryName, price: item.price, qty: 0 };
      }
      map[key].qty += qty;
    });
    return Object.values(map);
  };

  return (
    <div className="flex h-full w-full flex-col bg-white p-4 space-y-4">
      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0 border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center text-neutral-900">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-neutral-500">CA Ventes Réalisé</div>
            <div className="text-lg font-bold tabular-nums text-[#b38059]">{formatFCFA(totalSalesRevenue)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <div className="flex h-8 w-8 items-center justify-center text-emerald-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-neutral-500">Tickets Validés</div>
            <div className="text-lg font-bold tabular-nums text-emerald-700">{validatedInvoices.length}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <div className="flex h-8 w-8 items-center justify-center text-rose-600">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-neutral-500">Tickets Annulés</div>
            <div className="text-lg font-bold tabular-nums text-rose-700">{cancelledCount}</div>
          </div>
        </div>
      </div>

      {/* Search & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <Receipt className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-bold text-neutral-900">Mes Encaissements & Tickets</h2>
          <span className="text-xs font-semibold text-neutral-500">
            ({invoices.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Selector Filter */}
          <div className="flex items-center gap-2 border-b border-neutral-200 py-1">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-neutral-900 text-xs font-medium outline-none cursor-pointer focus:border-neutral-900"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-xs text-neutral-400 hover:text-neutral-900 px-1 cursor-pointer"
                title="Toutes les dates"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Dropdown Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-transparent border-b border-neutral-200 text-neutral-900 text-xs font-medium py-1 outline-none cursor-pointer focus:border-neutral-900"
          >
            <option value="all">Tous statuts</option>
            <option value="VALIDATED">Validés</option>
            <option value="CANCELLED">Annulés</option>
          </select>

          {/* Search bar */}
          <div className="relative w-56">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Rechercher ticket ou client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-0 border-b border-neutral-200 bg-transparent py-1 pl-6 pr-2 text-xs text-neutral-900 placeholder-neutral-400 outline-none focus:border-neutral-900"
            />
          </div>

          <button
            type="button"
            onClick={fetchCashierInvoices}
            className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
          >
            Actualiser
          </button>
        </div>
      </div>

      {loadError && <ErrorState title="Historique indisponible" description={loadError} onRetry={fetchCashierInvoices} />}

      {/* Invoices Table */}
      <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white border-b border-neutral-200 text-xs font-semibold text-neutral-500">
              <tr>
                <th className="px-3 py-2.5">Ticket N°</th>
                <th className="px-3 py-2.5">Date & Heure</th>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Shop</th>
                <th className="px-3 py-2.5">Règlement</th>
                <th className="px-3 py-2.5 text-right">Montant Total</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-4"><LoadingState label="Chargement de vos tickets..." rows={3} /></td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-4"><EmptyState title="Aucun encaissement" description="Aucun ticket ne correspond à ces filtres." className="border-0 bg-transparent" /></td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedInvoice(inv)}
                    className="hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5 font-bold text-[#b38059]">
                      <div className="text-xs">{inv.invoiceNumber}</div>
                      {isReservationInvoice(inv) && (
                        <span className="mt-0.5 inline-block text-[11px] font-medium text-[#825534] bg-[#b38059]/15 px-1.5 py-0.5">
                          RDV Salon
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500 text-xs">
                      {new Date(inv.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-neutral-900">
                      {inv.clientName || 'Client de passage'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-700">
                      {inv.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-900">
                      {getPaymentMethodLabel(inv.paymentMethod)}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-right text-[#b38059] text-xs">
                      {formatFCFA(inv.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip
                        tone={inv.status === 'VALIDATED' ? 'emerald' : 'red'}
                        label={inv.status === 'VALIDATED' ? 'Validée' : 'Annulée'}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-neutral-500" />
                          <span>Détails</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerPrint(inv)}
                          className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-[#825534] bg-[#b38059]/15 hover:bg-[#b38059]/25 cursor-pointer"
                          title="Lancer la réimpression directe"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Imprimer</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white border-t border-neutral-200 text-xs font-bold z-10">
              <tr>
                <td colSpan={5} className="px-3 py-2.5 text-neutral-900 font-bold">
                  Total Encaissements ({filteredInvoices.filter(i => i.status === 'VALIDATED').length}/{filteredInvoices.length} validé{filteredInvoices.length > 1 ? 's' : ''})
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-[#b38059]">
                  {formatFCFA(filteredInvoices.filter(i => i.status === 'VALIDATED').reduce((sum, inv) => sum + (parseFloat(inv.totalAmount) || 0), 0))}
                </td>
                <td colSpan={2} className="px-3 py-2.5 text-center text-neutral-500 font-normal">
                  Filtre actif
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* INVOICE DETAILS MODAL / DRAWER */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-neutral-900/30 cursor-pointer"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="w-full max-w-md bg-white border-l border-neutral-200 h-full flex flex-col p-6 overflow-hidden cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#b38059]" />
                <div>
                  <h3 className="text-sm font-bold text-[#b38059]">{selectedInvoice.invoiceNumber}</h3>
                  <div className="text-xs text-neutral-500">Détails du ticket</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="p-1 text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="space-y-2 text-xs border-b border-neutral-200 pb-4">
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Date & Heure</span>
                  <span className="font-medium text-neutral-900">{new Date(selectedInvoice.createdAt).toLocaleString('fr-FR')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Client</span>
                  <span className="font-medium text-[#b38059]">{selectedInvoice.clientName || 'Client de passage'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Shop</span>
                  <span className="font-medium text-neutral-900">{selectedInvoice.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Mode de paiement</span>
                  <span className="font-medium text-emerald-700">{getPaymentMethodLabel(selectedInvoice.paymentMethod)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-500">Statut</span>
                  <StatusChip
                    tone={selectedInvoice.status === 'VALIDATED' ? 'emerald' : 'red'}
                    label={selectedInvoice.status === 'VALIDATED' ? 'Validée' : 'Annulée'}
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500">Prestations & Produits</div>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-neutral-200 text-neutral-500 font-semibold">
                    <tr>
                      <th className="py-2">Désignation</th>
                      <th className="py-2 text-center">Qté</th>
                      <th className="py-2 text-right">P/U</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {groupInvoiceItems(selectedInvoice.items).map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 text-neutral-900">{item.categoryName}</td>
                        <td className="py-2 text-center text-neutral-500">{item.qty}</td>
                        <td className="py-2 text-right text-neutral-500">{formatFCFA(item.price)}</td>
                        <td className="py-2 text-right font-bold text-[#b38059]">{formatFCFA(item.price * item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Amount Box */}
              <div className="border-t border-b border-neutral-200 py-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-500">Montant Total Réglé</div>
                <div className="text-lg font-bold text-[#b38059] tabular-nums">{formatFCFA(selectedInvoice.totalAmount)}</div>
              </div>
            </div>

            {/* Modal Bottom Action: Re-print */}
            <div className="border-t border-neutral-200 pt-4 shrink-0">
              <button
                type="button"
                onClick={() => triggerPrint(selectedInvoice)}
                className="w-full rounded bg-[#b38059] hover:bg-[#9d6f4b] py-2 px-4 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Réimprimer ce Ticket</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}