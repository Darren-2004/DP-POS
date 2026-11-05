import React, { useState, useEffect } from 'react';
import ReservationsView from '../components/ReservationsView';
import CashierInvoicesView from '../components/CashierInvoicesView';
import CashierStatsView from '../components/CashierStatsView';
import CheckoutWorkspace from './CheckoutWorkspace';
import { apiFetch, formatFCFA, triggerPrint, triggerProformaPrint, showToast, getPrintMode } from '../utils/helpers';
import { API_BASE } from '../utils/constants';

export default function CashierView({
  categories = [],
  categoriesLoading = false,
  categoriesError = '',
  onRetryCategories,
  currentUser,
  serverOnline,
  activeTab = 'sale',
  setActiveTab,
  printStationId,
  printStations = [],
  setPrintStationId,
  stationSelectionRequired,
  activeShop = 'ALL',
}) {
  const [cart, setCart] = useState([]);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedMethods, setSelectedMethods] = useState(['CASH']);
  const [methodAmounts, setMethodAmounts] = useState({ CASH: '', ONLINE: '', ORANGE_MONEY: '' });
  const [showReservationMode, setShowReservationMode] = useState(false);
  const [reservationAdvanceInput, setReservationAdvanceInput] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Products from /api/products
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [serviceProviders, setServiceProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState('');
  const cashierShopType = ['HOMME', 'FEMME'].includes(currentUser?.shopType)
    ? currentUser.shopType
    : ['HOMME', 'FEMME'].includes(activeShop)
      ? activeShop
      : null;

  const fetchProducts = async () => {
    setProductsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/products?inStockOnly=true`);
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore
    } finally {
      setProductsLoading(false);
    }
  };

  const handleUpdateCartProvider = (id, providerId) => {
    const provider = serviceProviders.find((entry) => entry.id === providerId);
    setCart((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, providerId: provider?.id || '', providerName: provider?.name || '' }
          : item
      )
    );
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentUser?.id || !cashierShopType) {
      setServiceProviders([]);
      setProvidersError('');
      return () => {
        active = false;
      };
    }

    const fetchServiceProviders = async () => {
      setProvidersLoading(true);
      setServiceProviders([]);
      setProvidersError('');
      try {
        const params = new URLSearchParams({ shopType: cashierShopType });
        const res = await apiFetch(`${API_BASE}/service-providers?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Impossible de charger les prestataires.');
        if (active) setServiceProviders(Array.isArray(data) ? data : []);
      } catch (error) {
        if (active) {
          setServiceProviders([]);
          setProvidersError(error.message || 'Erreur réseau lors du chargement des prestataires.');
        }
      } finally {
        if (active) setProvidersLoading(false);
      }
    };

    fetchServiceProviders();
    return () => {
      active = false;
    };
  }, [currentUser?.id, currentUser?.shopType, cashierShopType]);

  const formatClientName = (value) => {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(^|\s|[-'])([a-zà-ÿ])/g, (match, prefix, char) => prefix + char.toUpperCase());
  };

  const handleClientNameChange = (value) => {
    setClientName(formatClientName(value));
  };

  const handleClientPhoneChange = (value) => {
    const cleaned = String(value ?? '')
      .replace(/[^\d+]/g, '')
      .replace(/(?!^)\+/g, '')
      .slice(0, 15);
    setClientPhone(cleaned);
  };

  const handleAddItemToCart = (itemData) => {
    // itemData: { categoryName, price, qty, itemType }
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      categoryName: typeof itemData === 'string' ? itemData : itemData.categoryName,
      price: typeof itemData === 'object' && itemData.price !== undefined ? itemData.price : '',
      qty: typeof itemData === 'object' && itemData.qty !== undefined ? itemData.qty : 1,
      itemType: typeof itemData === 'object' && itemData.itemType ? itemData.itemType : 'SERVICE',
      providerId: typeof itemData === 'object' ? itemData.providerId || '' : '',
      providerName: typeof itemData === 'object' ? itemData.providerName || '' : '',
    };
    setCart((prev) => [...prev, newItem]);
  };

  const handleUpdateCartField = (id, field, value) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const handleRemoveFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.qty, 10) || 1;
      return sum + price * qty;
    }, 0);
  };

  const getFinalPaymentMethod = () => {
    if (selectedMethods.length === 0) return 'CASH';
    if (selectedMethods.length === 1) return selectedMethods[0];
    const parts = selectedMethods.map((m) => {
      const v = parseFloat(methodAmounts[m]) || 0;
      return `${m}=${v}`;
    });
    return `MULTIPLE:${parts.join(';')}`;
  };

  const validateMultiplePayments = (targetTotal) => {
    if (selectedMethods.length <= 1) return true;
    const sum = selectedMethods.reduce((acc, m) => acc + (parseFloat(methodAmounts[m]) || 0), 0);
    if (Math.abs(sum - targetTotal) > 0.01) {
      showToast(`La répartition (${formatFCFA(sum)}) ne correspond pas au total (${formatFCFA(targetTotal)}).`, 'error');
      return false;
    }
    return true;
  };

  const handleValidateAndPrint = async () => {
    if (cart.length === 0) {
      showToast('Le panier est vide', 'error');
      return;
    }

    const invalidLine = cart.find(
      (item) => isNaN(Number(item.price)) || Number(item.price) < 0 || isNaN(Number(item.qty)) || Number(item.qty) < 1
    );
    if (invalidLine) {
      showToast(`Veuillez vérifier le prix ou la quantité de "${invalidLine.categoryName}"`, 'error');
      return;
    }

    const targetTotal = getCartTotal();
    if (targetTotal < 0) {
      showToast('Le montant total de la commande ne peut pas être négatif.', 'error');
      return;
    }
    if (!validateMultiplePayments(targetTotal)) return;

    const formattedClient = clientName.trim() && clientPhone.trim()
      ? `${clientName.trim()} (${clientPhone.trim()})`
      : clientName.trim() || clientPhone.trim() || 'Client de passage';

    setIsSubmittingOrder(true);
    try {
      const res = await apiFetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAmount: targetTotal,
          paymentMethod: getFinalPaymentMethod(),
          shopType: activeShop !== 'ALL' ? activeShop : (currentUser.shopType && currentUser.shopType !== 'ALL' ? currentUser.shopType : 'FEMME'),
          items: cart.map((it) => ({
            categoryName: it.categoryName,
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
            itemType: it.itemType || 'SERVICE',
            providerId: it.providerId || undefined,
          })),
          createdById: currentUser.id,
          clientName: formattedClient,
          clientPhone: clientPhone.trim() || undefined,
          stationId: getPrintMode() === 'PRINT_AGENT' ? (printStationId || undefined) : undefined,
        }),
      });

      const invoiceData = await res.json();
      if (!res.ok) {
        showToast(invoiceData.error || 'Erreur lors de la validation', 'error');
        setIsSubmittingOrder(false);
        return;
      }

      triggerPrint(invoiceData, printStationId);
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      fetchProducts();
      showToast('Facture enregistrée et ticket imprimé !', 'success');

      // Reset cart
      setCart([]);
      setSelectedMethods(['CASH']);
      setMethodAmounts({ CASH: '', ONLINE: '', ORANGE_MONEY: '' });
      setClientName('');
      setClientPhone('');
    } catch {
      showToast('Erreur réseau lors de la facturation', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleConfirmReservation = async () => {
    if (cart.length === 0) {
      showToast('Le panier est vide', 'error');
      return;
    }
    if (!clientName.trim() && !clientPhone.trim()) {
      showToast('Veuillez renseigner le nom ou le téléphone du client.', 'error');
      return;
    }

    const targetTotal = getCartTotal();
    const advanceNum = parseFloat(reservationAdvanceInput) || 0;
    if (advanceNum > 0 && !validateMultiplePayments(advanceNum)) return;

    setIsSubmittingOrder(true);
    try {
      const serviceSummary = cart.map((it) => it.categoryName).join(', ');
      const scheduledAt = reservationDate ? `${reservationDate}T${reservationTime || '12:00'}:00` : null;

      const res = await fetch(`${API_BASE}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          scheduledAt,
          bookingTime: reservationTime || null,
          serviceName: serviceSummary,
          shopType: activeShop !== 'ALL' ? activeShop : (currentUser.shopType && currentUser.shopType !== 'ALL' ? currentUser.shopType : 'FEMME'),
          totalAmount: targetTotal,
          advanceAmount: advanceNum,
          items: cart.map((it) => ({
            categoryName: it.categoryName,
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
            itemType: it.itemType || 'SERVICE',
          })),
          createdById: currentUser.id,
          stationId: getPrintMode() === 'PRINT_AGENT' ? (printStationId || undefined) : undefined,
          initialPayment: advanceNum > 0 ? {
            amount: advanceNum,
            paymentMethod: getFinalPaymentMethod(),
          } : null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        showToast(resData.error || 'Erreur lors de la réservation', 'error');
        setIsSubmittingOrder(false);
        return;
      }

      if (advanceNum > 0) {
        triggerProformaPrint(resData, printStationId);
      }
      showToast('Rendez-vous enregistré avec succès !', 'success');

      setCart([]);
      setShowReservationMode(false);
      setReservationAdvanceInput('');
      setClientName('');
      setClientPhone('');
    } catch {
      showToast('Erreur réseau', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Transfer reservation to active checkout cart
  const handleTransferToCart = (resObj) => {
    setClientName(resObj.clientName || '');
    setClientPhone(resObj.clientPhone || '');
    const advanceAlreadyPaid = Number(resObj.totalPaid || resObj.advanceAmount || 0);

    const cartItems = resObj.items && resObj.items.length > 0
      ? resObj.items.map((it) => ({
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
          categoryName: it.categoryName,
          price: Number(it.price) || 0,
          qty: Number(it.qty) || 1,
          itemType: it.itemType || 'SERVICE',
        }))
      : [
          {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
            categoryName: resObj.serviceName || 'Prestation salon',
            price: Number(resObj.totalAmount) || 0,
            qty: 1,
            itemType: 'SERVICE',
          },
        ];

    if (advanceAlreadyPaid > 0) {
      cartItems.push({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        categoryName: `Acompte déduit (${resObj.reservationNo})`,
        price: -advanceAlreadyPaid,
        qty: 1,
        itemType: 'SERVICE',
      });
    }

    setCart(cartItems);
    if (setActiveTab) setActiveTab('sale');
    const msg = advanceAlreadyPaid > 0
      ? `Rendez-vous de ${resObj.clientName} chargé en caisse (Acompte de ${formatFCFA(advanceAlreadyPaid)} déduit) !`
      : `Rendez-vous de ${resObj.clientName} chargé dans la caisse !`;
    showToast(msg, 'success');
  };

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden bg-white">
      {activeTab === 'sale' && (
        <CheckoutWorkspace
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onRetryCategories={onRetryCategories}
          products={products}
          productsLoading={productsLoading}
          serviceProviders={serviceProviders}
          providersLoading={providersLoading}
          providersError={providersError}
          cart={cart}
          handleAddItemToCart={handleAddItemToCart}
          handleUpdateCartField={handleUpdateCartField}
          handleUpdateCartProvider={handleUpdateCartProvider}
          handleRemoveFromCart={handleRemoveFromCart}
          handleClearCart={handleClearCart}
          getCartTotal={getCartTotal}
          clientName={clientName}
          setClientName={handleClientNameChange}
          clientPhone={clientPhone}
          setClientPhone={handleClientPhoneChange}
          selectedMethods={selectedMethods}
          setSelectedMethods={setSelectedMethods}
          methodAmounts={methodAmounts}
          setMethodAmounts={setMethodAmounts}
          showReservationMode={showReservationMode}
          setShowReservationMode={setShowReservationMode}
          reservationAdvanceInput={reservationAdvanceInput}
          setReservationAdvanceInput={setReservationAdvanceInput}
          reservationDate={reservationDate}
          setReservationDate={setReservationDate}
          reservationTime={reservationTime}
          setReservationTime={setReservationTime}
          isSubmittingOrder={isSubmittingOrder}
          serverOnline={serverOnline}
          printStationId={printStationId}
          printStations={printStations}
          setPrintStationId={setPrintStationId}
          stationSelectionRequired={stationSelectionRequired}
          currentUser={currentUser}
          handleValidateAndPrint={handleValidateAndPrint}
          handleConfirmReservation={handleConfirmReservation}
          activeShop={activeShop}
        />
      )}

      {activeTab === 'reservations' && (
        <ReservationsView
          categories={categories}
          currentUser={currentUser}
          serverOnline={serverOnline}
          printStationId={printStationId}
          onTransferToCart={handleTransferToCart}
          activeShop={activeShop}
        />
      )}

      {activeTab === 'my_invoices' && (
        <CashierInvoicesView
          currentUser={currentUser}
          serverOnline={serverOnline}
          printStationId={printStationId}
        />
      )}

      {activeTab === 'stats' && (
        <CashierStatsView
          currentUser={currentUser}
          serverOnline={serverOnline}
        />
      )}
    </div>
  );
}