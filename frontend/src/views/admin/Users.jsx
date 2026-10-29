import React, { useState } from 'react';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmModal from '../../components/ConfirmModal';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { API_BASE } from '../../utils/constants';
import { apiFetch, showToast } from '../../utils/helpers';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/DesignSystem';

const ROLES = [
  { id: 'CASHIER', label: 'Caissier / Caissière' },
  { id: 'MANAGER', label: 'Gérant(e) de shop' },
  { id: 'ADMIN', label: 'Administrateur' }
];

const underlineInputCls =
  'w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export default function Users({ users = [], fetchUsers, loading = false, error = '', isManager = false, managerOnly = false, managerShopType = null }) {
  const isShopManager = isManager;
  const allowedRoles = managerOnly ? ROLES.filter((role) => role.id === 'MANAGER') : ROLES;
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState(managerOnly ? 'MANAGER' : 'CASHIER');
  const [newShopType, setNewShopType] = useState(managerOnly ? 'HOMME' : 'ALL');

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState('CASHIER');
  const [editShopType, setEditShopType] = useState('ALL');
  const [savingAction, setSavingAction] = useState('');
  const [pendingDeleteUser, setPendingDeleteUser] = useState(null);

  const createUser = async () => {
    try {
      if (managerOnly && !['HOMME', 'FEMME'].includes(newShopType)) {
        showToast('Chaque gérant doit être assigné à un shop', 'error');
        return;
      }
      if (isShopManager && !managerShopType) {
        showToast('Aucun shop assigné à ce compte', 'error');
        return;
      }
      if (!newName.trim()) {
        showToast('Nom requis', 'error');
        return;
      }
      setSavingAction('create');
      const res = await apiFetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          pin: newPin.trim() || '0000',
          role: isShopManager ? 'CASHIER' : managerOnly ? 'MANAGER' : newRole,
          shopType: isShopManager ? managerShopType : newShopType,
          permissions: 'ALL'
        })
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName('');
        setNewPin('');
        setNewRole(managerOnly ? 'MANAGER' : 'CASHIER');
        setNewShopType(isShopManager ? managerShopType : managerOnly ? 'HOMME' : 'ALL');
        fetchUsers && fetchUsers();
        showToast('Utilisateur créé avec succès.', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || j.detail || 'Erreur lors de la création', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSavingAction('');
    }
  };

  const startEdit = (u) => {
    setEditing(u);
    setEditName(u.name);
    setEditPin('');
    setEditRole(u.role || 'CASHIER');
    setEditShopType(u.shopType || 'ALL');
  };

  const saveEdit = async () => {
    try {
      if (managerOnly && !['HOMME', 'FEMME'].includes(editShopType)) {
        showToast('Chaque gérant doit être assigné à un shop', 'error');
        return;
      }
      if (isShopManager && !managerShopType) {
        showToast('Aucun shop assigné à ce compte', 'error');
        return;
      }
      if (!editName.trim()) {
        showToast('Nom requis', 'error');
        return;
      }
      setSavingAction('update');
      const bodyData = {
        name: editName.trim(),
        role: isShopManager ? 'CASHIER' : managerOnly ? 'MANAGER' : editRole,
        shopType: isShopManager ? managerShopType : editShopType,
        permissions: 'ALL'
      };
      if (editPin && editPin.trim().length >= 4) {
        bodyData.pin = editPin.trim();
      }

      const res = await apiFetch(`${API_BASE}/users/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      if (res.ok) {
        setEditing(null);
        fetchUsers && fetchUsers();
        showToast('Utilisateur mis à jour.', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || j.detail || 'Erreur lors de la mise à jour', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSavingAction('');
    }
  };

  const confirmDeleteUser = async () => {
    const u = pendingDeleteUser;
    if (!u) return setPendingDeleteUser(null);
    setSavingAction('delete');
    try {
      const res = await apiFetch(`${API_BASE}/users/${u.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Utilisateur supprimé.', 'success');
        fetchUsers && fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || err.detail || 'Impossible de supprimer.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setPendingDeleteUser(null);
      setSavingAction('');
    }
  };

  const getRoleLabel = (role) => {
    if (role === 'ADMIN') return 'Administrateur';
    if (role === 'MANAGER') return 'Gérant(e)';
    return 'Caissier/ère';
  };

  return (
    <div className="space-y-6 bg-white">
      <PageHeader
        title="Gestion de l'Équipe"
        description="Gérez les comptes des caissiers, des gérants de shop et des administrateurs du salon."
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47]"
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter un membre</span>
          </button>
        }
      />

      <div>
        {loading && users.length === 0 ? (
          <LoadingState label="Chargement des utilisateurs..." rows={3} className="border-0 bg-transparent p-0" />
        ) : error ? (
          <ErrorState title="Erreur" description={error} onRetry={fetchUsers} />
        ) : users.length === 0 ? (
          <EmptyState title="Aucun utilisateur" description="Créez un premier profil pour commencer." className="border-0 bg-transparent" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="py-2 pr-4 font-normal">Nom</th>
                  <th className="py-2 px-3 font-normal">Rôle</th>
                  <th className="py-2 px-3 font-normal">Shop</th>
                  <th className="py-2 pl-4 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-50 transition">
                    <td className="py-2.5 pr-4 font-medium text-neutral-900">{u.name}</td>
                    <td className="py-2.5 px-3 text-neutral-600">{getRoleLabel(u.role)}</td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {u.shopType === 'HOMME' ? 'Shop 1' : u.shopType === 'FEMME' ? 'Shop 2' : 'Tous'}
                    </td>
                    <td className="py-2.5 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="text-neutral-400 hover:text-neutral-900 transition"
                          title="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteUser(u)}
                            className="text-neutral-400 hover:text-red-600 transition"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Créer */}
      {showCreate && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau Membre de l'Équipe">
          <div className="space-y-4 text-xs">
            <Field label="Nom complet" required>
              <input
                type="text"
                placeholder="Ex: Sarah, Pierre..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            <Field label="Code PIN (4 chiffres)">
              <input
                type="password"
                maxLength={4}
                placeholder="Défaut: 0000"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              {!isShopManager && (
                <Field label="Rôle / Fonction">
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className={underlineInputCls}
                  >
                    {allowedRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </Field>
              )}

              {!isShopManager && (
                <Field label="Shop assigné">
                  <select
                    value={newShopType}
                    onChange={(e) => setNewShopType(e.target.value)}
                    className={underlineInputCls}
                  >
                    {!managerOnly && <option value="ALL">Tous les shops</option>}
                    <option value="HOMME">Shop 1</option>
                    <option value="FEMME">Shop 2</option>
                  </select>
                </Field>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={createUser}
                disabled={savingAction === 'create'}
                className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
              >
                {savingAction === 'create' ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Modifier */}
      {editing && (
        <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Modifier ${editing.name}`}>
          <div className="space-y-4 text-xs">
            <Field label="Nom complet" required>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            <Field label="Nouveau Code PIN (laisser vide pour ne pas changer)">
              <input
                type="password"
                maxLength={4}
                placeholder="4 chiffres"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              {!isShopManager && (
                <Field label="Rôle / Fonction">
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className={underlineInputCls}
                  >
                    {allowedRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </Field>
              )}

              {!isShopManager && (
                <Field label="Shop assigné">
                  <select
                    value={editShopType}
                    onChange={(e) => setEditShopType(e.target.value)}
                    className={underlineInputCls}
                  >
                    {!managerOnly && <option value="ALL">Tous les shops</option>}
                    <option value="HOMME">Shop 1</option>
                    <option value="FEMME">Shop 2</option>
                  </select>
                </Field>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingAction === 'update'}
                className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
              >
                {savingAction === 'update' ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="Supprimer l'utilisateur"
        message={`Voulez-vous vraiment supprimer "${pendingDeleteUser?.name}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        onConfirm={confirmDeleteUser}
        onCancel={() => setPendingDeleteUser(null)}
      />
    </div>
  );
}