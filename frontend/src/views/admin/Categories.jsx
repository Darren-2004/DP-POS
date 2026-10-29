import React, { useState } from 'react';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import ConfirmModal from '../../components/ConfirmModal';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/DesignSystem';
import { Trash2, Pencil, Plus, Scissors, Check, X } from 'lucide-react';
import { API_BASE } from '../../utils/constants';
import { showToast, formatFCFA } from '../../utils/helpers';

const underlineInputCls =
  'w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export default function Categories({ categories = [], fetchCategories, loading = false, error = '', isManager = false, managerShopType = null }) {
  const isShopManager = isManager;
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatShop, setNewCatShop] = useState('ALL');
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [pendingDeleteCat, setPendingDeleteCat] = useState(null);

  // Subcategory inline addition state
  const [addingSubForCat, setAddingSubForCat] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubPrice, setNewSubPrice] = useState('');

  // Subcategory editing state
  const [editingSub, setEditingSub] = useState(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubPrice, setEditSubPrice] = useState('');
  const [pendingDeleteSub, setPendingDeleteSub] = useState(null);

  const [isSaving, setIsSaving] = useState(false);

  // --- Category CRUD ---
  const createCategory = async () => {
    if (isShopManager && !['HOMME', 'FEMME'].includes(managerShopType)) {
      showToast('Aucun shop assigné à ce compte', 'error');
      return;
    }
    if (!newCatName.trim()) {
      showToast('Le nom de la catégorie de service est requis.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          shopType: isShopManager ? managerShopType : newCatShop,
          color: 'bg-amber-700'
        })
      });
      if (res.ok) {
        setShowCreateCat(false);
        setNewCatName('');
        setNewCatShop('ALL');
        fetchCategories && fetchCategories();
        showToast('Catégorie de prestation créée !', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || 'Erreur lors de la création', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveEditCategory = async () => {
    if (!editCatName.trim()) {
      showToast('Nom requis', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/categories/${editingCat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCatName.trim() })
      });
      if (res.ok) {
        setEditingCat(null);
        fetchCategories && fetchCategories();
        showToast('Catégorie mise à jour.', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || 'Erreur lors de la mise à jour', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteCategory = async () => {
    const c = pendingDeleteCat;
    if (!c) return setPendingDeleteCat(null);
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/categories/${c.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories && fetchCategories();
        showToast('Catégorie supprimée.', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || 'Erreur lors de la suppression', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
      setPendingDeleteCat(null);
    }
  };

  // --- SubCategory CRUD ---
  const createSubCategory = async (catId) => {
    if (!newSubName.trim()) {
      showToast('Nom de la prestation requis', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const priceNum = parseFloat(newSubPrice) || 0;
      const res = await fetch(`${API_BASE}/subcategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSubName.trim(),
          categoryId: catId,
          price: priceNum
        })
      });
      if (res.ok) {
        setAddingSubForCat(null);
        setNewSubName('');
        setNewSubPrice('');
        fetchCategories && fetchCategories();
        showToast('Prestation ajoutée !', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || 'Erreur lors de l’ajout', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveEditSubCategory = async () => {
    if (!editSubName.trim()) return;
    setIsSaving(true);
    try {
      const priceNum = parseFloat(editSubPrice) || 0;
      const res = await fetch(`${API_BASE}/subcategories/${editingSub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editSubName.trim(),
          price: priceNum
        })
      });
      if (res.ok) {
        setEditingSub(null);
        fetchCategories && fetchCategories();
        showToast('Prestation mise à jour !', 'success');
      } else {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || 'Erreur', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteSubCategory = async () => {
    const s = pendingDeleteSub;
    if (!s) return setPendingDeleteSub(null);
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/subcategories/${s.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories && fetchCategories();
        showToast('Prestation supprimée.', 'success');
      } else {
        const error = await res.json().catch(() => ({}));
        showToast(error.error || error.detail || 'Impossible de supprimer la prestation.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
      setPendingDeleteSub(null);
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <PageHeader
        title="Prestations & Services du Salon"
        description="Gérez les catégories de prestations et leurs tarifs indicatifs."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateCat(true)}
            className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47]"
          >
            <Plus className="h-4 w-4" />
            <span>Nouvelle Catégorie</span>
          </button>
        }
      />

      {loading && categories.length === 0 ? (
        <LoadingState label="Chargement des prestations..." rows={4} className="border-0 bg-transparent p-0" />
      ) : error ? (
        <ErrorState title="Erreur" description={error} onRetry={fetchCategories} />
      ) : categories.length === 0 ? (
        <EmptyState title="Aucune catégorie" description="Créez une catégorie pour commencer." className="border-0 bg-transparent" />
      ) : (
        <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
          {categories.map((cat) => (
            <div key={cat.id} className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-neutral-400" />
                  <h3 className="text-sm font-semibold text-neutral-900">{cat.name}</h3>
                  <span className="text-xs text-neutral-400">
                    ({(cat.subCategories || []).length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingSubForCat(cat.id);
                      setNewSubName('');
                      setNewSubPrice('');
                    }}
                    className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Ajouter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCat(cat);
                      setEditCatName(cat.name);
                    }}
                    className="text-neutral-400 hover:text-neutral-900 p-1"
                    title="Modifier"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteCat(cat)}
                    className="text-neutral-400 hover:text-red-600 p-1"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Form ajout prestation sous-catégorie */}
              {addingSubForCat === cat.id && (
                <div className="bg-neutral-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-neutral-900">
                    Ajouter une prestation dans "{cat.name}"
                  </p>
                  <div className="grid grid-cols-[1fr_120px_auto] gap-3 items-end">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nom (ex: Dégradé, Tresses...)"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      className={underlineInputCls}
                    />
                    <input
                      type="number"
                      placeholder="Prix FCFA"
                      value={newSubPrice}
                      onChange={(e) => setNewSubPrice(e.target.value)}
                      className={underlineInputCls}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => createSubCategory(cat.id)}
                        className="rounded bg-[#b38059] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9e6d47]"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingSubForCat(null)}
                        className="rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-500 hover:border-neutral-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub services list */}
              <div className="bg-neutral-50 divide-y divide-neutral-200">
                {(!cat.subCategories || cat.subCategories.length === 0) ? (
                  <p className="text-xs italic text-neutral-400 py-2.5 px-3">
                    Aucune prestation enregistrée dans cette catégorie.
                  </p>
                ) : (
                  cat.subCategories.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between px-3 py-2 text-xs transition hover:bg-neutral-100 group"
                    >
                      {editingSub?.id === sub.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editSubName}
                            onChange={(e) => setEditSubName(e.target.value)}
                            className={underlineInputCls}
                          />
                          <input
                            type="number"
                            value={editSubPrice}
                            onChange={(e) => setEditSubPrice(e.target.value)}
                            placeholder="Prix"
                            className="w-24 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                          />
                          <button onClick={saveEditSubCategory} className="text-emerald-700 p-1">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingSub(null)} className="text-neutral-400 p-1">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-neutral-900 truncate pr-2">{sub.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-semibold text-[#b38059]">
                              {sub.price > 0 ? formatFCFA(sub.price) : 'Prix libre'}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSub(sub);
                                  setEditSubName(sub.name);
                                  setEditSubPrice(String(sub.price || 0));
                                }}
                                className="text-neutral-400 hover:text-neutral-900"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteSub(sub)}
                                className="text-neutral-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Créer Catégorie */}
      {showCreateCat && (
        <Modal open={showCreateCat} onClose={() => setShowCreateCat(false)} title="Nouvelle Catégorie de Prestation">
          <div className="space-y-4 text-xs">
            <Field label="Nom de la catégorie" required>
              <input
                type="text"
                placeholder="Ex: Barber Homme, Coiffure Femme, Massages..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            {!isShopManager && (
              <Field label="Shop concerné">
                <select
                  value={newCatShop}
                  onChange={(e) => setNewCatShop(e.target.value)}
                  className={underlineInputCls}
                >
                  <option value="ALL">Tous les shops (Mixte)</option>
                  <option value="FEMME">Shop 2</option>
                  <option value="HOMME">Shop 1</option>
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowCreateCat(false)}
                className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={createCategory}
                disabled={isSaving}
                className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
              >
                {isSaving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Modifier Catégorie */}
      {editingCat && (
        <Modal open={Boolean(editingCat)} onClose={() => setEditingCat(null)} title="Modifier la Catégorie">
          <div className="space-y-4 text-xs">
            <Field label="Nom de la catégorie" required>
              <input
                type="text"
                value={editCatName}
                onChange={(e) => setEditCatName(e.target.value)}
                className={underlineInputCls}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveEditCategory}
                disabled={isSaving}
                className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete Category */}
      <ConfirmModal
        open={Boolean(pendingDeleteCat)}
        title="Supprimer la catégorie"
        message={`Voulez-vous supprimer "${pendingDeleteCat?.name}" et toutes ses prestations associées ?`}
        confirmText="Supprimer"
        onConfirm={confirmDeleteCategory}
        onCancel={() => setPendingDeleteCat(null)}
      />

      {/* Confirm Delete SubCategory */}
      <ConfirmModal
        open={Boolean(pendingDeleteSub)}
        title="Supprimer la prestation"
        message={`Voulez-vous supprimer "${pendingDeleteSub?.name}" ?`}
        confirmText="Supprimer"
        onConfirm={confirmDeleteSubCategory}
        onCancel={() => setPendingDeleteSub(null)}
      />
    </div>
  );
}