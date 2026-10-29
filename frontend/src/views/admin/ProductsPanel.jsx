import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Search } from 'lucide-react';
import { PageHeader, LoadingState, EmptyState, ErrorState } from '../../components/DesignSystem';
import Field from '../../components/Field';
import { formatFCFA, cx, showToast } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';

const PRODUCT_CATEGORIES = [
  'Mèches',
  'Produits capillaires',
  'Beauté & Onglerie',
  'Soins & Crèmes',
  'Accessoires',
  'Consommables',
  'Autre'
];

const underlineInputCls =
  'w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export default function ProductsPanel({ currentUser }) {
  const isManager = currentUser?.role === 'MANAGER';
  const managerShopType = isManager && ['HOMME', 'FEMME'].includes(currentUser.shopType) ? currentUser.shopType : null;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState(managerShopType || 'ALL');

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('Mèches');
  const [formShopType, setFormShopType] = useState('ALL');
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const url = managerShopType ? `${API_BASE}/products?shopType=${managerShopType}` : `${API_BASE}/products`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      } else {
        setError('Impossible de charger les produits.');
      }
    } catch {
      setError('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormPrice('');
    setFormCategory('Mèches');
    setFormShopType(managerShopType || 'ALL');
    setShowModal(true);
  };

  const openEditModal = (prod) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormPrice(String(prod.price || 0));
    setFormCategory(prod.category || 'Mèches');
    setFormShopType(managerShopType || prod.shopType || 'ALL');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isManager && !managerShopType) {
      showToast('Aucun shop assigné à ce compte', 'error');
      return;
    }
    if (!formName.trim()) {
      showToast('Le nom du produit est requis.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const priceVal = parseFloat(formPrice) || 0;
      const url = editingProduct ? `${API_BASE}/products/${editingProduct.id}` : `${API_BASE}/products`;
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          price: priceVal,
          category: formCategory,
          shopType: managerShopType || formShopType,
        }),
      });

      if (res.ok) {
        showToast(editingProduct ? 'Produit mis à jour !' : 'Produit ajouté avec succès !', 'success');
        setShowModal(false);
        fetchProducts();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Erreur lors de l’enregistrement.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (prodId) => {
    if (!window.confirm('Confirmer la suppression de ce produit ?')) return;
    try {
      const res = await fetch(`${API_BASE}/products/${prodId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Produit supprimé.', 'success');
        fetchProducts();
      } else {
        showToast('Erreur lors de la suppression.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    }
  };

  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
    if (shopFilter !== 'ALL' && p.shopType !== 'ALL' && p.shopType !== shopFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || (p.category && p.category.toLowerCase().includes(term));
  });

  return (
    <div className="space-y-6 bg-white">
      <PageHeader
        title="Gestion des Produits & Mèches"
        description="Gérez les articles de stock (mèches, crèmes, sérums, cires) qui peuvent être facturés avec les prestations."
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47]"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau Produit</span>
          </button>
        }
      />

      {/* Filters */}
      <div className="grid gap-4 sm:grid-cols-3 border-b border-neutral-200 pb-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Rechercher par nom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 pl-6 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
        </label>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 outline-none focus:border-neutral-900"
        >
          <option value="ALL">Toutes les catégories</option>
          {PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {!managerShopType && (
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 outline-none focus:border-neutral-900"
          >
            <option value="ALL">Tous les shops (Shop 1 & Shop 2)</option>
            <option value="FEMME">Shop 2</option>
            <option value="HOMME">Shop 1</option>
          </select>
        )}
      </div>

      {/* Products Table */}
      <div>
        {loading && products.length === 0 ? (
          <LoadingState label="Chargement des produits..." rows={4} className="border-0 bg-transparent p-0" />
        ) : error ? (
          <ErrorState title="Erreur" description={error} onRetry={fetchProducts} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title="Aucun produit trouvé"
            description="Ajoutez des mèches, produits ou consommables pour commencer."
            className="border-0 bg-transparent"
            action={
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter un produit</span>
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="py-2 pr-4 font-normal">Désignation</th>
                  <th className="py-2 px-3 font-normal">Catégorie</th>
                  <th className="py-2 px-3 font-normal">Shop</th>
                  <th className="py-2 px-3 text-right font-normal">Prix de vente</th>
                  <th className="py-2 pl-4 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50 transition">
                    <td className="py-2.5 pr-4 font-medium text-neutral-900">{p.name}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{p.category || 'Stock'}</td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {p.shopType === 'HOMME' ? 'Shop 1' : p.shopType === 'FEMME' ? 'Shop 2' : 'Tous'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#b38059]">
                      {formatFCFA(p.price)}
                    </td>
                    <td className="py-2.5 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="text-neutral-400 hover:text-neutral-900 transition"
                          title="Modifier"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="text-neutral-400 hover:text-red-600 transition"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ajouter / Modifier */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-neutral-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit en stock'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <Field label="Nom du produit" required>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Mèche X-Pression, Cire mat, Sérum..."
                  className={underlineInputCls}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Prix de vente (FCFA)" required>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="Ex: 2000"
                    className={underlineInputCls}
                    required
                  />
                </Field>

                <Field label="Catégorie">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className={underlineInputCls}
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {!managerShopType && (
                <Field label="Shop assigné">
                  <select
                    value={formShopType}
                    onChange={(e) => setFormShopType(e.target.value)}
                    className={underlineInputCls}
                  >
                    <option value="ALL">Mixte / Tous les shops</option>
                    <option value="FEMME">Shop 2 uniquement</option>
                    <option value="HOMME">Shop 1 uniquement</option>
                  </select>
                </Field>
              )}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
                >
                  {submitting ? 'Enregistrement...' : editingProduct ? 'Enregistrer' : 'Créer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}