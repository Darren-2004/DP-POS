import React, { useState, useEffect, useCallback } from 'react';
import { Search, Phone, ShoppingBag, TrendingUp, Users, X } from 'lucide-react';
import { API_BASE } from '../../utils/constants';
import { cx, formatFCFA } from '../../utils/helpers';
import { EmptyState, ErrorState, LoadingState } from '../../components/DesignSystem';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export default function ClientsPanel() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchClients = useCallback(async (q = '') => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.append('q', q.trim());
      const res = await fetch(`${API_BASE}/clients/stats?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      } else {
        setLoadError('La liste des clients est indisponible. Réessayez dans un instant.');
      }
    } catch (e) {
      console.error('Fetch clients error:', e);
      setLoadError('Erreur réseau lors du chargement des clients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients('');
  }, [fetchClients]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchClients]);

  const totalClients = clients.length;
  const totalRevenue = clients.reduce((s, c) => s + (c.totalSpent || 0), 0);
  const topClient = clients.length > 0
    ? [...clients].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))[0]
    : null;

  return (
    <div className="space-y-6 bg-white">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-neutral-200 pb-5">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-neutral-400" />
          <div>
            <div className="text-xs text-neutral-500">Total Clients</div>
            <div className="text-xl font-semibold text-neutral-900">{totalClients}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <TrendingUp className="h-5 w-5 text-[#b38059]" />
          <div>
            <div className="text-xs text-neutral-500">Chiffre d'affaires clients</div>
            <div className="text-xl font-semibold text-[#b38059]">{formatFCFA(totalRevenue)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <ShoppingBag className="h-5 w-5 text-neutral-400" />
          <div>
            <div className="text-xs text-neutral-500">Meilleur client</div>
            <div className="text-sm font-semibold text-neutral-900 truncate">{topClient?.name || '—'}</div>
            {topClient && (
              <div className="text-xs text-[#b38059] font-medium">{formatFCFA(topClient.totalSpent)}</div>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="border-b border-neutral-200 pb-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Rechercher un client par nom ou téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-0 border-b border-transparent bg-transparent py-1.5 pl-6 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          {loading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-[#b38059] animate-pulse">
              Chargement...
            </div>
          )}
        </label>
      </div>

      {loadError && <ErrorState title="Chargement des clients impossible" description={loadError} onRetry={() => fetchClients(search)} />}
      {loading && clients.length === 0 && <LoadingState label="Chargement des clients..." rows={4} className="border-0 bg-transparent" />}

      {!loading && !loadError && clients.length === 0 && (
        <EmptyState
          title="Aucun client trouvé"
          description={search ? `Aucun résultat pour "${search}".` : "Aucun client n'est encore enregistré dans la base."}
          className="border-0 bg-transparent"
        />
      )}

      {clients.length > 0 && (
        <div className="flex gap-6 items-start">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="py-2 pr-4 font-normal">Client</th>
                  <th className="py-2 px-4 font-normal">Téléphone</th>
                  <th className="py-2 px-4 text-center font-normal">Visites</th>
                  <th className="py-2 px-4 text-right font-normal">Total Dépensé</th>
                  <th className="py-2 pl-4 text-right font-normal">Dernière Prestation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {clients.map((client) => {
                  const isSelected = selected?.id === client.id;
                  return (
                    <tr
                      key={client.id || client.name}
                      onClick={() => setSelected(isSelected ? null : client)}
                      className={cx(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                      )}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-neutral-900">{client.name}</div>
                        {client.note && <div className="text-xs text-neutral-400 truncate max-w-xs">{client.note}</div>}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">
                        {client.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-neutral-400" />
                            {client.phone}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center font-medium text-neutral-900">
                        {client.invoiceCount ?? 0}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-[#b38059]">
                        {formatFCFA(client.totalSpent)}
                      </td>
                      <td className="py-2.5 pl-4 text-right text-neutral-500">
                        {formatDate(client.lastVisit || client.lastInvoiceAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside className="w-80 shrink-0 border-l border-neutral-200 pl-6 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <h4 className="font-semibold text-sm text-neutral-900">Fiche Client</h4>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-neutral-400 hover:text-neutral-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-neutral-500">Nom Complet</div>
                  <div className="text-base font-semibold text-neutral-900 mt-0.5">{selected.name}</div>
                </div>

                {selected.phone && (
                  <div>
                    <div className="text-neutral-500">Téléphone</div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 mt-0.5">
                      <Phone className="h-3.5 w-3.5 text-neutral-400" />
                      <a href={`tel:${selected.phone}`} className="hover:underline">{selected.phone}</a>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-200">
                  <div>
                    <div className="text-neutral-500">Total Dépensé</div>
                    <div className="text-sm font-semibold text-[#b38059] mt-0.5">{formatFCFA(selected.totalSpent)}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Prestations</div>
                    <div className="text-sm font-semibold text-neutral-900 mt-0.5">{selected.invoiceCount ?? 0}</div>
                  </div>
                </div>

                {selected.lastVisit && (
                  <div className="pt-3 border-t border-neutral-200">
                    <div className="text-neutral-500">Dernier passage</div>
                    <div className="text-xs text-neutral-900 mt-0.5 font-medium">{formatDate(selected.lastVisit)}</div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}