import React, { useState } from 'react';
import { Search, Trash2, Scissors, Package } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../components/DesignSystem';
import { formatFCFA, cx } from '../utils/helpers';
import CheckoutControls from './CheckoutControls';

export default function CheckoutWorkspace({
  categories = [],
  categoriesLoading = false,
  categoriesError = '',
  onRetryCategories,
  products = [],
  productsLoading = false,
  cart = [],
  handleAddItemToCart,
  handleUpdateCartField,
  handleRemoveFromCart,
  handleClearCart,
  getCartTotal,
  clientName,
  setClientName,
  clientPhone,
  setClientPhone,
  selectedMethods,
  setSelectedMethods,
  methodAmounts,
  setMethodAmounts,
  showReservationMode,
  setShowReservationMode,
  reservationAdvanceInput,
  setReservationAdvanceInput,
  reservationDate,
  setReservationDate,
  reservationTime,
  setReservationTime,
  isSubmittingOrder,
  serverOnline,
  printStationId,
  stationSelectionRequired,
  currentUser,
  handleValidateAndPrint,
  handleConfirmReservation,
  activeShop = 'ALL',
}) {
  const [activeCatalogTab, setActiveCatalogTab] = useState('services'); // 'services' | 'products'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState([]);

  const toggleExpandCategory = (catId) => {
    setExpandedCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  // Filter Categories by shop and search
  const filteredCategories = categories.filter((cat) => {
    if (activeShop !== 'ALL' && cat.shopType && cat.shopType !== 'ALL' && cat.shopType !== activeShop) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const catMatch = cat.name.toLowerCase().includes(term);
    const subMatch = (cat.subCategories || []).some((s) => s.name.toLowerCase().includes(term));
    return catMatch || subMatch;
  });

  // Filter Products by shop and search
  const filteredProducts = products.filter((prod) => {
    if (activeShop !== 'ALL' && prod.shopType && prod.shopType !== 'ALL' && prod.shopType !== activeShop) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return prod.name.toLowerCase().includes(term) || (prod.category && prod.category.toLowerCase().includes(term));
  });

  const total = getCartTotal
    ? getCartTotal()
    : cart.reduce((acc, it) => acc + (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1), 0);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-white xl:grid-cols-[340px_1px_minmax(0,1fr)]">
      {/* LEFT: Catalogue (Services + Produits) */}
      <section className="flex min-h-0 flex-col overflow-hidden" aria-label="Catalogue Salon">
        {/* Catalog Tabs */}
        <div className="flex items-center gap-5 border-b border-neutral-200 px-4 pt-3">
          <button
            type="button"
            onClick={() => setActiveCatalogTab('services')}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition',
              activeCatalogTab === 'services'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            )}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Prestations</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCatalogTab('products')}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition',
              activeCatalogTab === 'products'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            )}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Mèches & Stock</span>
            {products.length > 0 && <span className="text-xs text-neutral-400">{products.length}</span>}
          </button>
        </div>

        {/* Search Input */}
        <div className="border-b border-neutral-200 px-4 py-2.5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              aria-label="Rechercher une prestation ou un produit"
              placeholder={activeCatalogTab === 'services' ? 'Rechercher une prestation...' : 'Rechercher mèches, cire, gel...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-0 border-b border-transparent bg-transparent py-1 pl-6 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
            />
          </label>
        </div>

        {/* List Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {activeCatalogTab === 'services' ? (
            categoriesLoading && categories.length === 0 ? (
              <LoadingState label="Chargement des prestations..." rows={5} className="border-0 bg-transparent p-2" />
            ) : categoriesError ? (
              <ErrorState title="Erreur catalogue" description={categoriesError} onRetry={onRetryCategories} className="p-3" />
            ) : filteredCategories.length === 0 ? (
              <EmptyState title="Aucune prestation" description="Aucune catégorie de service trouvée." className="min-h-36 border-0 bg-transparent px-0" />
            ) : (
              filteredCategories.map((cat) => {
                const isExpanded = expandedCatIds.includes(cat.id) || Boolean(searchTerm);
                const subs = cat.subCategories || [];
                return (
                  <div key={cat.id} className="border-b border-neutral-200 py-1.5 last:border-0">
                    <button
                      type="button"
                      onClick={() => toggleExpandCategory(cat.id)}
                      className="flex w-full items-center justify-between gap-2 py-1 text-left text-sm font-medium text-neutral-900"
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className="text-xs font-normal text-neutral-400">{subs.length}</span>
                    </button>

                    {/* Sub services */}
                    {isExpanded && subs.length > 0 && (
                      <div className="mb-1.5 divide-y divide-neutral-200 bg-neutral-50">
                        {subs.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() =>
                              handleAddItemToCart({
                                categoryName: `${cat.name} - ${sub.name}`,
                                price: sub.price || 0,
                                qty: 1,
                                itemType: 'SERVICE',
                              })
                            }
                            disabled={!serverOnline}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
                          >
                            <span className="truncate">{sub.name}</span>
                            <span className="shrink-0 font-medium text-[#b38059]">
                              {sub.price > 0 ? formatFCFA(sub.price) : 'Prix libre'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : /* PRODUCTS & STOCK */
          productsLoading && products.length === 0 ? (
            <LoadingState label="Chargement des produits..." rows={5} className="border-0 bg-transparent p-2" />
          ) : filteredProducts.length === 0 ? (
            <EmptyState title="Aucun produit" description="Aucun produit ou mèche en stock." className="min-h-36 border-0 bg-transparent px-0" />
          ) : (
            filteredProducts.map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() =>
                  handleAddItemToCart({
                    categoryName: prod.name,
                    price: prod.price || 0,
                    qty: 1,
                    itemType: 'PRODUCT',
                  })
                }
                disabled={!serverOnline}
                className="flex w-full items-center justify-between gap-2 border-b border-neutral-200 py-2 text-left text-sm transition hover:bg-neutral-50 disabled:opacity-40 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">{prod.name}</p>
                  <p className="truncate text-xs text-neutral-400">{prod.category || 'Stock'}</p>
                </div>
                <span className="shrink-0 font-medium text-[#b38059]">{formatFCFA(prod.price)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="hidden bg-neutral-200 xl:block" />

      {/* RIGHT: Panier & Facturation */}
      <section className="flex min-h-0 flex-col overflow-hidden bg-white" aria-label="Ticket en cours">
        {/* Header panier */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Ticket en cours</h2>
            <span className="text-xs text-neutral-400">
              {cart.length} {cart.length <= 1 ? 'article' : 'articles'}
            </span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={handleClearCart}
              className="flex items-center gap-1 text-xs text-neutral-500 transition hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vider</span>
            </button>
          )}
        </div>

        {/* Cart Table */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <EmptyState
              title="Le panier est vide"
              description="Sélectionnez des prestations (coiffure, soins...) ou des produits de stock (mèches, crèmes...)."
              className="min-h-48 border-0 bg-transparent"
            />
          ) : (
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-neutral-200 bg-white">
                <tr className="text-xs text-neutral-400">
                  <th className="py-2 pl-4 pr-2 font-normal">Désignation</th>
                  <th className="w-16 px-2 py-2 text-center font-normal">Qté</th>
                  <th className="w-28 px-2 py-2 text-right font-normal">Prix unit.</th>
                  <th className="w-28 px-2 py-2 pr-4 text-right font-normal">Total</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {cart.map((item) => {
                  const lineTotal = (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1);
                  const isProduct = item.itemType === 'PRODUCT';
                  return (
                    <tr key={item.id} className="group align-middle hover:bg-neutral-50">
                      {/* Designation */}
                      <td className="py-2 pl-4 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-[10px] font-semibold text-neutral-400">
                            {isProduct ? 'STOCK' : 'SOIN'}
                          </span>
                          <input
                            type="text"
                            value={item.categoryName}
                            onChange={(e) => handleUpdateCartField(item.id, 'categoryName', e.target.value)}
                            className="w-full border-0 border-b border-transparent bg-transparent font-medium text-neutral-900 outline-none focus:border-neutral-900"
                          />
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleUpdateCartField(item.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full border-0 border-b border-transparent bg-transparent text-center font-medium text-neutral-900 outline-none focus:border-neutral-900"
                        />
                      </td>

                      {/* Unit Price (Editable!) */}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={item.price}
                          onChange={(e) => handleUpdateCartField(item.id, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full border-0 border-b border-transparent bg-transparent text-right font-medium text-neutral-900 outline-none focus:border-neutral-900"
                        />
                      </td>

                      {/* Line Total */}
                      <td className="px-2 py-2 pr-4 text-right font-semibold text-[#b38059]">
                        {formatFCFA(lineTotal)}
                      </td>

                      {/* Delete */}
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="text-neutral-300 transition hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Controls (Payment & Print) */}
        <CheckoutControls
          cart={cart}
          total={total}
          currentUser={currentUser}
          serverOnline={serverOnline}
          printStationId={printStationId}
          stationSelectionRequired={stationSelectionRequired}
          isSubmittingOrder={isSubmittingOrder}
          showReservationMode={showReservationMode}
          setShowReservationMode={setShowReservationMode}
          reservationAdvanceInput={reservationAdvanceInput}
          setReservationAdvanceInput={setReservationAdvanceInput}
          reservationDate={reservationDate}
          setReservationDate={setReservationDate}
          reservationTime={reservationTime}
          setReservationTime={setReservationTime}
          clientName={clientName}
          setClientName={setClientName}
          clientPhone={clientPhone}
          setClientPhone={setClientPhone}
          selectedMethods={selectedMethods}
          setSelectedMethods={setSelectedMethods}
          methodAmounts={methodAmounts}
          setMethodAmounts={setMethodAmounts}
          handleValidateAndPrint={handleValidateAndPrint}
          handleConfirmReservation={handleConfirmReservation}
        />
      </section>
    </div>
  );
}
