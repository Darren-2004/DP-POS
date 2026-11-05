import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  AlertTriangle,
  Package,
  TrendingUp,
  Boxes,
  Bell,
  BellOff,
  FolderPlus,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PageHeader, LoadingState, EmptyState, ErrorState } from '../../components/DesignSystem';
import Field from '../../components/Field';
import { formatFCFA, cx, showToast } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';
import { useShopNames } from '../../components/ShopNamesContext';

const underlineInputCls =
  'w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export default function ProductsPanel({ currentUser }) {
  const { shopNames } = useShopNames();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isManager = currentUser?.role === 'MANAGER';
  const managerShopType = isManager && ['HOMME', 'FEMME'].includes(currentUser.shopType) ? currentUser.shopType : null;

  // Products state
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState(managerShopType || 'ALL');

  // Stats state (Admin only)
  const [stockStats, setStockStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [showAlertDetails, setShowAlertDetails] = useState(false);

  // Modal Product state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formStockQty, setFormStockQty] = useState('0');
  const [formCategory, setFormCategory] = useState('');
  const [formShopType, setFormShopType] = useState('ALL');
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Modal Category state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatShop, setNewCatShop] = useState(managerShopType || 'ALL');
  const [submittingCat, setSubmittingCat] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const url = managerShopType
        ? `${API_BASE}/product-categories?shopType=${managerShopType}`
        : `${API_BASE}/product-categories`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore
    }
  }, [managerShopType]);

  const fetchStockStats = useCallback(async () => {
    if (!isAdmin) return;
    setStatsLoading(true);
    try {
      const url = shopFilter !== 'ALL'
        ? `${API_BASE}/stock/stats?shopType=${shopFilter}`
        : `${API_BASE}/stock/stats`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setStockStats(data);
      }
    } catch {
      // Ignore
    } finally {
      setStatsLoading(false);
    }
  }, [isAdmin, shopFilter]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const targetShop = managerShopType || (shopFilter !== 'ALL' ? shopFilter : null);
      const url = targetShop
        ? `${API_BASE}/products?shopType=${targetShop}`
        : `${API_BASE}/products`;
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
  }, [managerShopType, shopFilter]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  useEffect(() => {
    if (isAdmin) {
      fetchStockStats();
    }
  }, [isAdmin, fetchStockStats]);

  const openAddProductModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormPrice('');
    setFormStockQty('0');
    setFormCategory(categories.length > 0 ? categories[0].name : 'Autre');
    setFormShopType(managerShopType || 'ALL');
    setShowProductModal(true);
  };

  const openEditProductModal = (prod) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormPrice(String(prod.price || 0));
    setFormStockQty(String(prod.stockQty ?? 0));
    setFormCategory(prod.category || (categories[0]?.name || 'Autre'));
    setFormShopType(managerShopType || prod.shopType || 'ALL');
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    if (isManager && !managerShopType) {
      showToast('Aucun shop assigné à ce compte', 'error');
      return;
    }
    if (!formName.trim()) {
      showToast('Le nom du produit est requis.', 'error');
      return;
    }
    setSubmittingProduct(true);
    try {
      const priceVal = parseFloat(formPrice) || 0;
      const stockVal = parseInt(formStockQty, 10) || 0;
      const url = editingProduct ? `${API_BASE}/products/${editingProduct.id}` : `${API_BASE}/products`;
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          price: priceVal,
          stockQty: stockVal,
          category: formCategory || 'Autre',
          shopType: managerShopType || formShopType,
        }),
      });

      if (res.ok) {
        showToast(editingProduct ? 'Produit mis à jour !' : 'Produit ajouté avec succès !', 'success');
        setShowProductModal(false);
        fetchProducts();
        if (isAdmin) fetchStockStats();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Erreur lors de l’enregistrement.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleProductDelete = async (prodId) => {
    if (!window.confirm('Confirmer la suppression de ce produit ?')) return;
    try {
      const res = await fetch(`${API_BASE}/products/${prodId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Produit supprimé.', 'success');
        fetchProducts();
        if (isAdmin) fetchStockStats();
      } else {
        showToast('Erreur lors de la suppression.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      showToast('Veuillez saisir un nom de catégorie.', 'error');
      return;
    }
    setSubmittingCat(true);
    try {
      const res = await fetch(`${API_BASE}/product-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          shopType: managerShopType || newCatShop,
        }),
      });
      if (res.ok) {
        showToast('Catégorie ajoutée avec succès !', 'success');
        setNewCatName('');
        fetchCategories();
        if (isAdmin) fetchStockStats();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Erreur lors de la création.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setSubmittingCat(false);
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`Confirmer la suppression de la catégorie "${catName}" ? Les produits associés seront reclassés en "Autre".`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/product-categories/${catId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Catégorie supprimée.', 'success');
        if (categoryFilter === catName) setCategoryFilter('ALL');
        fetchCategories();
        fetchProducts();
        if (isAdmin) fetchStockStats();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.detail || data.error || 'Erreur lors de la suppression.', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    }
  };

  const handleToggleAlerts = async () => {
    const nextState = !stockStats?.alerts?.enabled;
    try {
      const res = await fetch(`${API_BASE}/stock/alerts-toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) {
        showToast(nextState ? 'Alertes de stock activées' : 'Alertes de stock désactivées', 'info');
        if (isAdmin) fetchStockStats();
      }
    } catch {
      showToast('Erreur lors de la modification des alertes', 'error');
    }
  };

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
    if (shopFilter !== 'ALL' && p.shopType !== 'ALL' && p.shopType !== shopFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || (p.category && p.category.toLowerCase().includes(term));
  });

  const alerts = stockStats?.alerts;
  const hasAlerts = (alerts?.outOfStockCount > 0 || alerts?.lowStockCount > 0);
  const showAlertBanner = isAdmin && alerts?.enabled && hasAlerts && !alertDismissed;

  return (
    <div className="space-y-6 bg-white p-1">
      {/* Page Header */}
      <PageHeader
        title="Gestion du Stock"
        description="Gérez les articles de stock physique, les catégories de produits, les niveaux de stock et la valorisation financière."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              <FolderPlus className="h-4 w-4 text-neutral-500" />
              <span>Gérer les Catégories</span>
            </button>
            <button
              type="button"
              onClick={openAddProductModal}
              className="inline-flex items-center gap-1.5 rounded bg-[#b38059] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47]"
            >
              <Plus className="h-4 w-4" />
              <span>Nouveau Produit</span>
            </button>
          </div>
        }
      />

      {/* Stock Alert Banner (Admin) */}
      {showAlertBanner && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-2xs transition">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-900">
                  Alerte Stock — Produits en rupture ou stock faible
                </h4>
                <p className="mt-0.5 text-xs text-amber-800">
                  {alerts.outOfStockCount > 0 && (
                    <span className="font-semibold text-red-700 mr-2">
                      • {alerts.outOfStockCount} produit(s) en rupture de stock
                    </span>
                  )}
                  {alerts.lowStockCount > 0 && (
                    <span className="font-semibold text-amber-800">
                      • {alerts.lowStockCount} produit(s) avec stock &lt; 5 unités
                    </span>
                  )}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAlertDetails((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 underline hover:text-black"
                  >
                    <span>{showAlertDetails ? 'Masquer la liste' : 'Voir les produits concernés'}</span>
                    {showAlertDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleAlerts}
                title="Désactiver complètement les alertes de stock"
                className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100/50"
              >
                <BellOff className="h-3 w-3" />
                <span>Désactiver l'alerte</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertDismissed(true)}
                className="rounded p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
                title="Ignorer pour le moment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Expanded Alert Details */}
          {showAlertDetails && (
            <div className="mt-3 divide-y divide-amber-200 border-t border-amber-200 pt-3">
              {alerts.outOfStock.length > 0 && (
                <div className="py-1.5">
                  <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide">Ruptures de stock (0) :</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {alerts.outOfStock.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded bg-red-100/80 px-2 py-0.5 text-xs font-medium text-red-800">
                        {p.name} ({p.category})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {alerts.lowStock.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Stock faible (&lt; 5) :</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {alerts.lowStock.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {p.name} ({p.stockQty} restants)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin Financial Analytics KPI Cards */}
      {isAdmin && stockStats && (
        <section aria-label="Indicateurs Financiers de Stock" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Valorisation & Revenus du Stock
            </h3>
            {alerts && !alerts.enabled && (
              <button
                type="button"
                onClick={handleToggleAlerts}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900"
              >
                <Bell className="h-3 w-3 text-neutral-400" />
                <span>Réactiver les alertes de stock</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* KPI 1: Valeur totale du stock */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">Valeur Totale du Stock</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b38059]/10 text-[#b38059]">
                  <Boxes className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-bold text-neutral-900">
                {formatFCFA(stockStats.totalStockValue)}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">
                {stockStats.totalStockQuantity} unité{stockStats.totalStockQuantity > 1 ? 's' : ''} physique{stockStats.totalStockQuantity > 1 ? 's' : ''}
              </p>
            </div>

            {/* KPI 2: Revenus totaux du stock */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">Revenus Générés (Ventes)</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {formatFCFA(stockStats.totalStockRevenue)}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">
                Chiffre d'affaires cumulé des articles vendus
              </p>
            </div>

            {/* KPI 3: Références & État du catalogue */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">Catalogue & Références</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Package className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-bold text-neutral-900">
                {products.length} référence{products.length > 1 ? 's' : ''}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">
                Réparties dans {categories.length} catégorie{categories.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Category Financial Breakdown Table */}
          {stockStats.categoryStats?.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
              <h4 className="text-xs font-bold text-neutral-800 mb-3">
                Données de Stock par Catégorie
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500">
                      <th className="py-2 pr-4 font-semibold">Catégorie</th>
                      <th className="py-2 px-3 text-center font-semibold">Produits</th>
                      <th className="py-2 px-3 text-center font-semibold">Unités en stock</th>
                      <th className="py-2 px-3 text-right font-semibold">Valeur Stock</th>
                      <th className="py-2 px-3 text-right font-semibold">Revenus Ventes</th>
                      <th className="py-2 pl-4 text-right font-semibold">Part CA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                    {stockStats.categoryStats.map((c) => (
                      <tr key={c.name} className="hover:bg-neutral-50/80 transition">
                        <td className="py-2 pr-4 font-semibold text-neutral-900">{c.name}</td>
                        <td className="py-2 px-3 text-center text-neutral-600">{c.productCount}</td>
                        <td className="py-2 px-3 text-center font-medium">
                          {c.stockQty <= 0 ? (
                            <span className="text-red-600 font-bold">0 (Épuisé)</span>
                          ) : c.stockQty < 5 ? (
                            <span className="text-amber-700 font-bold">{c.stockQty}</span>
                          ) : (
                            <span className="text-neutral-800">{c.stockQty}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-[#b38059]">
                          {formatFCFA(c.stockValue)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {formatFCFA(c.revenue)}
                        </td>
                        <td className="py-2 pl-4 text-right text-neutral-500 font-medium">
                          {c.revenuePercentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => setCategoryFilter('ALL')}
          className={cx(
            'rounded-full px-3 py-1 text-xs font-semibold transition',
            categoryFilter === 'ALL'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          )}
        >
          Toutes les catégories ({products.length})
        </button>
        {categories.map((cat) => {
          const count = products.filter((p) => p.category === cat.name).length;
          return (
            <button
              key={cat.id || cat.name}
              type="button"
              onClick={() => setCategoryFilter(cat.name)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                categoryFilter === cat.name
                  ? 'bg-[#b38059] text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              )}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters (Search & Shop) */}
      <div className="grid gap-4 sm:grid-cols-2 border-b border-neutral-200 pb-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Rechercher un produit par nom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border-0 border-b border-neutral-200 bg-transparent py-1.5 pl-6 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
        </label>

        {!managerShopType && (
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="border-0 border-b border-neutral-200 bg-transparent py-1.5 text-xs text-neutral-900 outline-none focus:border-neutral-900"
          >
            <option value="ALL">Tous les shops ({shopNames.HOMME} & {shopNames.FEMME})</option>
            <option value="FEMME">{shopNames.FEMME}</option>
            <option value="HOMME">{shopNames.HOMME}</option>
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
            description="Ajoutez des articles en stock pour commencer."
            className="border-0 bg-transparent"
            action={
              <button
                type="button"
                onClick={openAddProductModal}
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
                  <th className="py-2 px-3 text-center font-normal">État du stock</th>
                  <th className="py-2 px-3 text-right font-normal">Prix de vente</th>
                  <th className="py-2 px-3 text-right font-normal">Valeur Stock</th>
                  <th className="py-2 pl-4 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredProducts.map((p) => {
                  const qty = Number(p.stockQty) || 0;
                  const price = Number(p.price) || 0;
                  const lineValue = qty * price;
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50 transition">
                      <td className="py-2.5 pr-4 font-semibold text-neutral-900">{p.name}</td>
                      <td className="py-2.5 px-3 text-neutral-600">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                          {p.category || 'Autre'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">
                        {p.shopType === 'HOMME' ? shopNames.HOMME : p.shopType === 'FEMME' ? shopNames.FEMME : 'Tous'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {qty <= 0 ? (
                          <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                            Rupture (0)
                          </span>
                        ) : qty < 5 ? (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            Faible ({qty})
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {qty} en stock
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-neutral-900">
                        {formatFCFA(price)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#b38059]">
                        {formatFCFA(lineValue)}
                      </td>
                      <td className="py-2.5 pl-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditProductModal(p)}
                            className="text-neutral-400 hover:text-neutral-900 transition p-1"
                            title="Modifier"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleProductDelete(p.id)}
                            className="text-neutral-400 hover:text-red-600 transition p-1"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Produit Ajouter / Modifier */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-neutral-200 bg-white p-5 space-y-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit en stock'}
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="space-y-4 text-xs">
              <Field label="Nom du produit" required>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Mèche X-Pression, Huile de coco, Cire..."
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
                    placeholder="Ex: 5000"
                    className={underlineInputCls}
                    required
                  />
                </Field>

                <Field label="Quantité en stock" required>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formStockQty}
                    onChange={(e) => setFormStockQty(e.target.value)}
                    placeholder="Ex: 10"
                    className={underlineInputCls}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Catégorie" required>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className={underlineInputCls}
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat.id || cat.name} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                    {categories.length === 0 && <option value="Autre">Autre</option>}
                  </select>
                </Field>

                {!managerShopType && (
                  <Field label="Shop assigné">
                    <select
                      value={formShopType}
                      onChange={(e) => setFormShopType(e.target.value)}
                      className={underlineInputCls}
                    >
                      <option value="ALL">Mixte / Tous les shops</option>
                      <option value="FEMME">{shopNames.FEMME} uniquement</option>
                      <option value="HOMME">{shopNames.HOMME} uniquement</option>
                    </select>
                  </Field>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="rounded border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-400"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submittingProduct}
                  className="rounded bg-[#b38059] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#9e6d47] disabled:opacity-40"
                >
                  {submittingProduct ? 'Enregistrement...' : editingProduct ? 'Enregistrer' : 'Créer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gestion des Catégories */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg border border-neutral-200 bg-white p-5 space-y-4 rounded-xl shadow-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                Gestion des Catégories de Stock
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            {/* Form Nouvelle Catégorie */}
            <form onSubmit={handleCreateCategory} className="space-y-3 rounded-lg bg-neutral-50 p-3 text-xs border border-neutral-200">
              <span className="font-semibold text-neutral-800">Ajouter une nouvelle catégorie</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nom de la catégorie (ex: Mèches, Huiles...)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={submittingCat}
                  className="inline-flex items-center gap-1 rounded bg-[#b38059] px-3 py-1.5 font-semibold text-white hover:bg-[#9e6d47] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Ajouter</span>
                </button>
              </div>
            </form>

            {/* Liste des catégories existantes */}
            <div className="flex-1 overflow-y-auto space-y-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Catégories actuelles ({categories.length})
              </p>
              <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                {categories.length === 0 ? (
                  <p className="p-4 text-center text-xs text-neutral-400">Aucune catégorie créée</p>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat.id || cat.name}
                      className="flex items-center justify-between p-2.5 text-xs hover:bg-neutral-50 transition"
                    >
                      <div>
                        <span className="font-semibold text-neutral-900">{cat.name}</span>
                        <span className="ml-2 text-[11px] text-neutral-400">
                          ({cat.productCount ?? 0} produit{(cat.productCount ?? 0) > 1 ? 's' : ''})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="rounded p-1 text-neutral-400 hover:text-red-600 transition"
                        title="Supprimer la catégorie"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
