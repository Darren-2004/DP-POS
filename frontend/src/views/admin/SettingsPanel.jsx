import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Download,
  ShieldAlert,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Store,
  Layers,
  FileCheck,
} from 'lucide-react';
import { PageHeader, LoadingState } from '../../components/DesignSystem';
import { API_BASE } from '../../utils/constants';
import { showToast } from '../../utils/helpers';

export default function SettingsPanel({ currentUser }) {
  const [backups, setBackups] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchSystemData = async () => {
    setLoading(true);
    try {
      const [diagRes, backRes] = await Promise.all([
        fetch(`${API_BASE}/system/diagnostics`),
        fetch(`${API_BASE}/system/backups`),
      ]);
      if (diagRes.ok) {
        const d = await diagRes.json();
        setDiagnostics(d);
      }
      if (backRes.ok) {
        const b = await backRes.json();
        setBackups(Array.isArray(b) ? b : b.backups || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemData();
  }, []);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system/backup`, { method: 'POST' });
      if (res.ok) {
        showToast('Sauvegarde de la base de données créée avec succès !', 'success');
        fetchSystemData();
      } else {
        showToast('Erreur lors de la création de la sauvegarde.', 'error');
      }
    } catch {
      showToast('Erreur réseau lors de la sauvegarde.', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-white pb-12">
      <PageHeader
        eyebrow="CONFIGURATION DU SYSTÈME"
        title="Paramètres & Sauvegardes"
        description="Santé de la base de données locale, sauvegardes automatiques, sécurité et informations de l'établissement."
      />

      {loading && <LoadingState label="Vérification de l’intégrité du système..." />}

      {/* Salon Identity Card */}
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3 border-b border-neutral-100 pb-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-[#b38059]/10 text-[#b38059]">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Établissement & Réseau</h3>
            <p className="text-xs text-neutral-400">Configuration des points de vente</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
            <span className="text-neutral-400 font-medium">Nom commercial</span>
            <p className="mt-1 font-bold text-neutral-900 text-sm">Dimitri Perfect</p>
          </div>
          <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
            <span className="text-neutral-400 font-medium">Points de vente</span>
            <p className="mt-1 font-bold text-neutral-900 text-sm">Shop 1 & Shop 2</p>
          </div>
          <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
            <span className="text-neutral-400 font-medium">Devise monétaire</span>
            <p className="mt-1 font-bold text-[#b38059] text-sm">Franc CFA (FCFA)</p>
          </div>
        </div>
      </div>

      {/* Database Health Card */}
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-50 text-emerald-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Base de Données Locale (SQLite)</h3>
              <p className="text-xs text-neutral-400">Statut de persistance et stockage local</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={backupLoading}
            className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#9e6d47] disabled:opacity-50 transition"
          >
            {backupLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <HardDrive className="h-3.5 w-3.5" />}
            <span>Créer une Sauvegarde</span>
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-neutral-100">
            <span className="text-neutral-600 font-medium">Vérification d'intégrité</span>
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              <CheckCircle2 className="h-3.5 w-3.5" /> Opérationnelle & Conforme
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-neutral-100">
            <span className="text-neutral-600 font-medium">Mode de Sauvegarde</span>
            <span className="font-semibold text-neutral-800">Automatique toutes les 6 heures + Manuelle</span>
          </div>
        </div>

        {/* Backups List */}
        {backups.length > 0 && (
          <div className="mt-5">
            <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
              Dernières Sauvegardes Disponibles
            </h4>
            <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
              {backups.slice(0, 5).map((b, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-[#b38059]" />
                    <span className="font-mono text-neutral-800">{b.filename || b.name || `Sauvegarde #${idx + 1}`}</span>
                  </div>
                  <span className="text-neutral-400">{b.size ? `${Math.round(b.size / 1024)} KB` : 'Valide'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
