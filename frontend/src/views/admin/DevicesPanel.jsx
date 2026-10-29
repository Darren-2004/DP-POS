import React, { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Printer, Trash2, Wifi } from 'lucide-react';
import { API_BASE } from '../../utils/constants';
import { showToast } from '../../utils/helpers';

export default function DevicesPanel() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [adminPin, setAdminPin] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadStations = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/print/stations`);
      if (!response.ok) {
        throw new Error('Impossible de charger les périphériques');
      }
      const data = await response.json();
      setStations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Erreur lors du chargement des périphériques.');
      setStations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
  }, []);

  const totalDevices = useMemo(() => stations.length, [stations]);
  const onlineDevices = useMemo(() => stations.filter((station) => station.online).length, [stations]);

  const handleDeleteStation = async () => {
    if (!pendingDeleteId) return;
    if (!adminPin.trim()) {
      showToast('Le code PIN administrateur est requis.', 'error');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/print/stations/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin.trim(),
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Suppression impossible');
      }

      showToast('Périphérique supprimé avec succès', 'success');
      setPendingDeleteId(null);
      setAdminPin('');
      loadStations();
    } catch (e) {
      showToast(e.message || 'Erreur lors de la suppression', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-col gap-2 border-b border-neutral-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Imprimantes & Caisses Connectées</h2>
          <p className="text-xs text-neutral-500">Configuration réseau des stations d'impression thermique du salon (Shop 1 / Shop 2)</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Wifi className="h-4 w-4 text-emerald-600" />
          <span>{onlineDevices} en ligne / {totalDevices} configurée{totalDevices > 1 ? 's' : ''}</span>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 p-3 text-xs text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="flex min-h-36 items-center justify-center">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#b38059]" />
        </div>
      ) : stations.length === 0 ? (
        <div className="py-8 text-center text-xs text-neutral-400">
          Aucun périphérique d'impression enregistré.
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
          {stations.map((station) => (
            <div key={station.id} className="py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-neutral-400" />
                    <h3 className="truncate text-sm font-semibold text-neutral-900">{station.name}</h3>
                  </div>
                  <div className="text-xs text-neutral-500 space-x-3">
                    <span>Machine : <strong className="font-medium text-neutral-900">{station.hostName || 'Inconnu'}</strong></span>
                    <span>Imprimante : <strong className="font-medium text-neutral-900">{station.printerName || 'Par défaut'}</strong></span>
                    <span>Agent : <strong className="font-medium text-neutral-900">{station.agentVersion || '1.0.0'}</strong></span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <span className={`font-medium ${station.online ? 'text-emerald-700' : 'text-neutral-400'}`}>
                    {station.online ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-neutral-400 font-mono">ID: {station.id.slice(0, 12)}...</span>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-red-600 transition"
                  onClick={() => setPendingDeleteId(station.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {pendingDeleteId === station.id && (
                <div className="bg-neutral-50 p-3 space-y-2">
                  <p className="text-xs text-neutral-900">
                    Saisissez le PIN administrateur pour supprimer :
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="PIN Admin"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      className="border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                    />
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDeleteStation}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {isDeleting ? '...' : 'Confirmer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPendingDeleteId(null); setAdminPin(''); }}
                      className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:border-neutral-400"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}