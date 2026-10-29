import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Search, CheckSquare, Square, CheckCircle, Clock, MapPin, Phone, User, Printer, XCircle, PackageCheck, Calendar, RotateCcw, UserCheck, DollarSign, UserMinus, ShieldCheck, PlusCircle, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { API_BASE } from '../utils/constants';
import { triggerPrint, showToast, getTodayDateStr, cx, formatFCFA, getPaymentMethodLabel } from '../utils/helpers';
import { EmptyState, ErrorState, LoadingState } from './DesignSystem';

export default function DeliveriesView({ currentUser, cashierId, hideTopTotals = false, onlyPaid = false, startDate, endDate, categories: initialCategories = [] }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, PENDING, IN_DELIVERY, DELIVERED, CANCELLED
  const [selectedDriverFilter, setSelectedDriverFilter] = useState('ALL'); // ALL or driver name
  const [filterDate, setFilterDate] = useState(() => {
    if (startDate && endDate && startDate === endDate) return startDate;
    if (startDate && endDate && startDate !== endDate) return '';
    return getTodayDateStr();
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  useEffect(() => {
    if (startDate && endDate && startDate === endDate) {
      setFilterDate(startDate);
    } else if (startDate && endDate && startDate !== endDate) {
      setFilterDate('');
    }
  }, [startDate, endDate]);

  // Payment Confirmation Modal (when marking PAYEE or DELIVERED)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetBulkStatus, setTargetBulkStatus] = useState(null);
  const [targetSingleDelivery, setTargetSingleDelivery] = useState(null);
  const [paymentActionType, setPaymentActionType] = useState('DELIVERED'); // 'DELIVERED' or 'PAY_ONLY'
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  // Driver Assignment Modal (when marking IN_DELIVERY)
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [targetInDeliveryItem, setTargetInDeliveryItem] = useState(null);
  const [driverInput, setDriverInput] = useState('');
  const [savedDrivers, setSavedDrivers] = useState([]);
  const [showDriverSuggestions, setShowDriverSuggestions] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Filter: Mes Livraisons (Active by default for non-admins, disabled for Admin)
  const [onlyMyDeliveries, setOnlyMyDeliveries] = useState(() => currentUser?.role !== 'ADMIN');

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      setOnlyMyDeliveries(false);
    }
  }, [currentUser?.role]);

  // Create Delivery Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [categoriesList, setCategoriesList] = useState(initialCategories);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [createCart, setCreateCart] = useState([]);
  const [createClientName, setCreateClientName] = useState('');
  const [createClientPhone, setCreateClientPhone] = useState('');
  const [createDeliveryAddress, setCreateDeliveryAddress] = useState('');
  const [createDeliveryFee, setCreateDeliveryFee] = useState('');
  const [createPaymentMethod, setCreatePaymentMethod] = useState('CASH');
  const [isCreatingDelivery, setIsCreatingDelivery] = useState(false);

  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      setCategoriesList(initialCategories);
    }
  }, [initialCategories]);

  const fetchCategoriesIfNeeded = async () => {
    if (categoriesList && categoriesList.length > 0) return;
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setCategoriesList(list);
        if (list.length > 0) {
          setSelectedCategoryId(list[0].id);
          setItemPrice(list[0].price || '');
        }
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleCategorySelectChange = (catId) => {
    setSelectedCategoryId(catId);
    const found = categoriesList.find(c => String(c.id) === String(catId));
    if (found) {
      setItemPrice(found.price || '');
    }
  };

  const handleAddItemToCart = () => {
    if (!selectedCategoryId) {
      showToast("⚠️ Choisissez un article", "warning");
      return;
    }
    const cat = categoriesList.find(c => String(c.id) === String(selectedCategoryId));
    if (!cat) return;

    const priceNum = parseFloat(itemPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast("⚠️ Prix invalide", "warning");
      return;
    }
    const qtyNum = parseInt(itemQty, 10) || 1;

    setCreateCart(prev => {
      const existingIdx = prev.findIndex(item => String(item.categoryId) === String(selectedCategoryId));
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].qty += qtyNum;
        copy[existingIdx].price = priceNum;
        return copy;
      } else {
        return [...prev, {
          categoryId: cat.id,
          categoryName: cat.name,
          price: priceNum,
          qty: qtyNum
        }];
      }
    });
  };

  const handleRemoveItemFromCart = (index) => {
    setCreateCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateDeliverySubmit = async (e) => {
    e?.preventDefault();
    if (createCart.length === 0) {
      showToast("⚠️ Indiquez au moins un article", "warning");
      return;
    }
    if (!createClientName.trim() && !createClientPhone.trim()) {
      showToast("⚠️ Indiquez au moins le nom ou le téléphone du client", "warning");
      return;
    }

    const itemsTotal = createCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const feeNum = parseFloat(createDeliveryFee) || 0;

    setIsCreatingDelivery(true);
    try {
      const res = await fetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAmount: itemsTotal,
          paymentMethod: createPaymentMethod,
          items: createCart.map(item => ({
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            price: item.price,
            qty: item.qty
          })),
          createdById: currentUser?.id,
          clientName: createClientName.trim() || null,
          clientPhone: createClientPhone.trim() || null,
          isDelivery: true,
          deliveryAddress: createDeliveryAddress.trim() || null,
          deliveryFee: feeNum
        })
      });

      const invoiceData = await res.json();
      if (!res.ok) {
        showToast(`❌ ${invoiceData.error || 'Erreur lors de la création'}`, 'error');
        setIsCreatingDelivery(false);
        return;
      }

      showToast("✅ Livraison créée avec succès !", "success");
      triggerPrint(invoiceData);
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));

      // Reset form
      setCreateCart([]);
      setCreateClientName('');
      setCreateClientPhone('');
      setCreateDeliveryAddress('');
      setCreateDeliveryFee('');
      setCreateModalOpen(false);
      setIsCreatingDelivery(false);

      // Refresh list
      await fetchDeliveries();
    } catch (err) {
      console.error('Create delivery error:', err);
      showToast("❌ Erreur réseau lors de la création", "error");
      setIsCreatingDelivery(false);
    }
  };

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.append('status', filterStatus);
      if (selectedDriverFilter !== 'ALL') params.append('driver', selectedDriverFilter);
      if (filterDate) {
        params.append('date', filterDate);
      } else if (startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      const activeCashierId = onlyMyDeliveries ? (currentUser?.id || cashierId) : cashierId;
      if (activeCashierId) params.append('cashierId', activeCashierId);

      const res = await fetch(`${API_BASE}/deliveries?${params.toString()}`);
      const contentType = res.headers.get('content-type') || '';

      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setDeliveries(list);
        return list; // retourner les données pour usage immédiat
      } else {
        setDeliveries([]);
        setLoadError('Impossible de charger les livraisons.');
        return [];
      }
    } catch (err) {
      console.error('Error fetching deliveries:', err);
      setDeliveries([]);
      setLoadError('Erreur réseau lors du chargement des livraisons.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [filterStatus, selectedDriverFilter, filterDate, searchQuery, currentUser?.id, currentUser?.role, cashierId, startDate, endDate, onlyMyDeliveries]);

  const fetchSavedDrivers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/delivery-persons`);
      if (res.ok) {
        const data = await res.json();
        setSavedDrivers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching saved drivers:', err);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
    fetchSavedDrivers();
  }, [fetchDeliveries, fetchSavedDrivers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(fetchDeliveries, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchDeliveries]);

  const displayedDeliveries = deliveries.filter(d => {
    // Mode Dashboard : afficher uniquement les livraisons PAYÉES ou LIVRÉES (ou les deux)
    if (onlyPaid && !d.isPaid) {
      return false;
    }
    if (selectedDriverFilter !== 'ALL') {
      const sameDriver = (d.deliveryPerson || '').trim().toLowerCase() === selectedDriverFilter.trim().toLowerCase();
      if (!sameDriver) return false;
    }
    return true;
  });

  // Liste de tous les livreurs disponibles pour le menu déroulant
  const allAvailableDrivers = Array.from(new Set([
    ...savedDrivers.map(d => (d.name || '').trim()),
    ...deliveries.map(d => (d.deliveryPerson || '').trim())
  ]))
  .filter(Boolean)
  .sort();

  // N'afficher dans les pills que les livreurs ayant encore des livraisons EN COURS
  const activeDrivers = Array.from(new Set(
    deliveries
      .filter(d => d.deliveryStatus === 'IN_DELIVERY' && d.deliveryPerson)
      .map(d => (d.deliveryPerson || '').trim())
  )).sort();

  // Handle select all / deselect all
  const toggleSelectAll = () => {
    if (selectedIds.length === displayedDeliveries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedDeliveries.map(d => d.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Open modal to confirm driver when marking IN_DELIVERY
  const openInDeliveryModal = (deliveryOrBulk = null) => {
    if (deliveryOrBulk === 'BULK') {
      if (selectedIds.length === 0) return;
      setTargetInDeliveryItem('BULK');
      setDriverInput('');
    } else if (deliveryOrBulk) {
      setTargetInDeliveryItem(deliveryOrBulk);
      setDriverInput(deliveryOrBulk.deliveryPerson || '');
    }
    fetchSavedDrivers();
    setShowDriverSuggestions(false);
    setDriverModalOpen(true);
  };

  // Open modal to confirm payment method when marking PAYEE or DELIVERED
  const openPaymentModal = (actionType = 'DELIVERED', deliveryOrBulk = null) => {
    setPaymentActionType(actionType);
    if (deliveryOrBulk === 'BULK') {
      if (selectedIds.length === 0) return;
      setTargetBulkStatus(actionType);
      setTargetSingleDelivery(null);
    } else if (deliveryOrBulk) {
      setTargetSingleDelivery(deliveryOrBulk);
      setTargetBulkStatus(null);
      setPaymentMethod(deliveryOrBulk.paymentMethod || 'CASH');
    }
    setPaymentModalOpen(true);
  };

  // Unassign driver (retirer du livreur)
  const handleUnassignDriver = async (deliveryItem = null) => {
    setSubmitting(true);
    try {
      const target = deliveryItem || (selectedIds.length > 0 ? null : null);
      if (target) {
        const res = await fetch(`${API_BASE}/deliveries/${target.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'UNASSIGN' })
        });
        if (res.ok) {
          showToast(`✅ Livraison retirée du livreur (Remise en attente)`, 'info');
        }
      } else if (selectedIds.length > 0) {
        const res = await fetch(`${API_BASE}/deliveries/bulk-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds, action: 'UNASSIGN' })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(`✅ ${data.message || 'Livraisons retirées du livreur'}`, 'info');
          setSelectedIds([]);
        }
      }
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      const freshDeliveries = await fetchDeliveries();
      // Reset filtre si le livreur n'a plus rien en cours
      setSelectedDriverFilter(prev => {
        if (prev === 'ALL') return 'ALL';
        const stillHasInDelivery = freshDeliveries.some(
          d => (d.deliveryPerson || '').trim().toLowerCase() === prev.trim().toLowerCase()
            && d.deliveryStatus === 'IN_DELIVERY'
        );
        return stillHasInDelivery ? prev : 'ALL';
      });
    } catch (err) {
      console.error('Unassign driver error:', err);
      showToast("❌ Échec du retrait du livreur", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Main status & payment update handler
  const handleUpdateStatus = async (status, deliveryItem = null, extraParams = {}) => {
    // If action is PAY_ONLY
    if (extraParams.action === 'PAY') {
      if (!paymentModalOpen && !extraParams.paymentConfirmed) {
        openPaymentModal('PAY_ONLY', deliveryItem || (selectedIds.length > 0 ? 'BULK' : null));
        return;
      }
    }

    // If going to IN_DELIVERY, prompt for driver unless confirmed from driver modal
    if (status === 'IN_DELIVERY' && !extraParams.deliveryPersonConfirmed) {
      openInDeliveryModal(deliveryItem || (selectedIds.length > 0 ? 'BULK' : null));
      return;
    }

    // If going to DELIVERED, prompt for payment method unless confirmed from payment modal
    if (status === 'DELIVERED' && !paymentModalOpen && !extraParams.paymentConfirmed) {
      openPaymentModal('DELIVERED', deliveryItem || (selectedIds.length > 0 ? 'BULK' : null));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {};
      if (status) payload.status = status;
      if (extraParams.action) payload.action = extraParams.action;
      if (extraParams.deliveryPerson !== undefined) payload.deliveryPerson = extraParams.deliveryPerson;
      if (paymentMethod) payload.paymentMethod = paymentMethod;

      const target = targetInDeliveryItem === 'BULK' || targetBulkStatus ? null : (targetSingleDelivery || targetInDeliveryItem || deliveryItem);

      if (target && target !== 'BULK') {
        const res = await fetch(`${API_BASE}/deliveries/${target.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const msg = extraParams.action === 'PAY' ? 'Paiement enregistré' : `Statut mis à jour : ${getStatusLabel(status)}`;
          showToast(`✅ ${msg}`, 'success');
        }
      } else if (selectedIds.length > 0) {
        const res = await fetch(`${API_BASE}/deliveries/bulk-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds, ...payload })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(`✅ ${data.message || 'Mise à jour effectuée'}`, 'success');
          setSelectedIds([]);
        }
      }

      setPaymentModalOpen(false);
      setDriverModalOpen(false);

      // Si un livreur vient d'être assigné, basculer sur son filtre
      if (extraParams.deliveryPerson) {
        setSelectedDriverFilter(extraParams.deliveryPerson);
      }

      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      // Fetch les données fraîches et vérifier immédiatement si le filtre livreur doit être réinitialisé
      const freshDeliveries = await fetchDeliveries();
      await fetchSavedDrivers();

      // Reset du filtre livreur si le livreur actif n'a plus de livraisons EN COURS
      // (on utilise les données fraîches directement, pas le state qui peut être décalé)
      setSelectedDriverFilter(prev => {
        if (prev === 'ALL') return 'ALL'; // Déjà sur tout, on ne touche pas
        if (extraParams.deliveryPerson) return extraParams.deliveryPerson; // On vient d'assigner, on garde
        const stillHasInDelivery = freshDeliveries.some(
          d => (d.deliveryPerson || '').trim().toLowerCase() === prev.trim().toLowerCase()
            && d.deliveryStatus === 'IN_DELIVERY'
        );
        return stillHasInDelivery ? prev : 'ALL';
      });
    } catch (err) {
      console.error('Update status error:', err);
      showToast("❌ Échec de la mise à jour", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDriverAssignment = () => {
    const driverName = driverInput.trim();
    if (!driverName) {
      showToast("⚠️ Veuillez préciser le nom du livreur", "warning");
      return;
    }
    // Si la livraison est déjà LIVRÉE, on assigne juste le livreur sans changer le statut
    const isAlreadyDelivered = targetInDeliveryItem !== 'BULK' && targetInDeliveryItem?.deliveryStatus === 'DELIVERED';
    if (isAlreadyDelivered) {
      assignDriverOnly(targetInDeliveryItem, driverName);
    } else {
      handleUpdateStatus('IN_DELIVERY', targetInDeliveryItem, {
        deliveryPersonConfirmed: true,
        deliveryPerson: driverName
      });
    }
  };

  // Assigner uniquement le livreur sans changer le statut (pour livraisons déjà livrées)
  const assignDriverOnly = async (deliveryItem, driverName) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/deliveries/${deliveryItem.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ASSIGN_DRIVER_ONLY', deliveryPerson: driverName })
      });
      if (res.ok) {
        showToast(`✅ Livreur "${driverName}" assigné rétroactivement`, 'success');
        setDriverModalOpen(false);
        setSelectedDriverFilter(driverName);
        window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
        await fetchDeliveries();
        await fetchSavedDrivers();
      } else {
        showToast('❌ Erreur lors de l\'assignation du livreur', 'error');
      }
    } catch (err) {
      console.error('Assign driver only error:', err);
      showToast('❌ Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getLogisticsBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800"><Clock className="w-3 h-3 text-amber-600" /> En attente</span>;
      case 'IN_DELIVERY':
        return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800"><Truck className="w-3 h-3 text-sky-600" /> En cours</span>;
      case 'DELIVERED':
        return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800"><CheckCircle className="w-3 h-3 text-emerald-600" /> Livrée</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-800"><XCircle className="w-3 h-3 text-rose-600" /> Annulée</span>;
      default:
        return status;
    }
  };

  const getPaymentBadge = (del) => {
    const isPaid = del.isPaid || del.deliveryStatus === 'DELIVERED';
    if (isPaid) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          PAYÉE ({getPaymentMethodLabel(del.paymentMethod)})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
        ⚪ NON PAYÉE
      </span>
    );
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'IN_DELIVERY': return 'En cours de livraison';
      case 'DELIVERED': return 'Livrée';
      case 'CANCELLED': return 'Annulée';
      default: return status;
    }
  };

  // Calculate totals based on deliveries for the current date range
  const totalCount = deliveries.length;
  const pendingCount = deliveries.filter(d => (d.deliveryStatus || 'PENDING') === 'PENDING').length;
  const inDeliveryCount = deliveries.filter(d => d.deliveryStatus === 'IN_DELIVERY').length;
  const deliveredCount = deliveries.filter(d => d.deliveryStatus === 'DELIVERED').length;
  const paidCount = deliveries.filter(d => d.isPaid || d.deliveryStatus === 'DELIVERED').length;

  // Top KPI financial totals: based on ALL deliveries (paid/delivered), not filtered by driver
  const allPaidDeliveries = deliveries.filter(d => d.isPaid || d.deliveryStatus === 'DELIVERED');
  const totalWithoutFees = allPaidDeliveries.reduce((sum, d) => sum + (parseFloat(d.totalAmount) || 0), 0);
  const totalDeliveryFees = allPaidDeliveries.reduce((sum, d) => sum + (parseFloat(d.deliveryFee) || 0), 0);
  const totalWithFees = totalWithoutFees + totalDeliveryFees;

  // Suggestions filter for driver input
  const matchingDriverSuggestions = savedDrivers.filter(d =>
    d.name.toLowerCase().includes(driverInput.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-white p-4 space-y-4">
      {/* Header & Stats Cards */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200 pb-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-neutral-500" /> Espace Livraisons & Expéditions
          </h1>
          <p className="text-xs text-neutral-500">
            Gestion du statut comptable (Payée d'avance / à la livraison) et suivi logistique par livreur
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreateModalOpen(true);
              fetchCategoriesIfNeeded();
            }}
            className="px-3.5 py-2 rounded bg-[#b38059] hover:bg-[#9d6f4b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Nouvelle Livraison</span>
          </button>

          <button
            onClick={fetchDeliveries}
            className="px-3 py-2 rounded border border-neutral-200 hover:bg-neutral-50 text-xs font-medium text-neutral-900 cursor-pointer"
          >
            🔄 Actualiser
          </button>
        </div>
      </div>

      {/* KPI Stats & Financial Totals */}
      <div className={cx(
        "grid gap-4 border-b border-neutral-200 pb-4",
        hideTopTotals ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-6"
      )}>
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <div className="text-xs font-medium text-neutral-500">En attente</div>
            <div className="text-base font-bold tabular-nums text-amber-700">{pendingCount}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <Truck className="h-5 w-5 text-sky-600 shrink-0" />
          <div>
            <div className="text-xs font-medium text-neutral-500">En cours</div>
            <div className="text-base font-bold tabular-nums text-sky-700">{inDeliveryCount}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-neutral-200 pl-4">
          <PackageCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <div className="text-xs font-medium text-neutral-500">Livrées ({paidCount} Payées)</div>
            <div className="text-base font-bold tabular-nums text-emerald-700">{deliveredCount}</div>
          </div>
        </div>

        {!hideTopTotals && (
          <>
            <div className="border-l border-neutral-200 pl-4">
              <div className="text-xs font-medium text-emerald-800">TOTAL SANS FRAIS</div>
              <div className="text-xs sm:text-sm font-bold tabular-nums text-emerald-700">{formatFCFA(totalWithoutFees)}</div>
            </div>

            <div className="border-l border-neutral-200 pl-4">
              <div className="text-xs font-medium text-sky-800">TOTAL FRAIS LIVRAISON</div>
              <div className="text-xs sm:text-sm font-bold tabular-nums text-sky-700">{formatFCFA(totalDeliveryFees)}</div>
            </div>

            <div className="border-l border-neutral-200 pl-4">
              <div className="text-xs font-medium text-[#b38059]">TOTAL AVEC FRAIS</div>
              <div className="text-xs sm:text-sm font-bold tabular-nums text-[#b38059]">{formatFCFA(totalWithFees)}</div>
            </div>
          </>
        )}
      </div>

      {/* Filters Bar & Bulk Action Toolbar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
          {/* Status Filter Tabs + Mes Livraisons Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs">
              {[
                { id: 'ALL', label: 'Toutes' },
                { id: 'PENDING', label: 'En attente' },
                { id: 'IN_DELIVERY', label: 'En cours' },
                { id: 'DELIVERED', label: 'Livrées' },
                { id: 'CANCELLED', label: 'Annulées' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={cx(
                    'px-3 py-1.5 font-medium whitespace-nowrap cursor-pointer',
                    filterStatus === tab.id
                      ? 'bg-[#b38059]/15 text-[#825534] font-bold'
                      : 'text-neutral-500 hover:text-neutral-900'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mes Livraisons Toggle */}
            <button
              type="button"
              onClick={() => setOnlyMyDeliveries(v => !v)}
              title={onlyMyDeliveries ? 'Afficher toutes les livraisons' : 'Afficher uniquement mes livraisons'}
              className={cx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-neutral-200 whitespace-nowrap cursor-pointer',
                onlyMyDeliveries
                  ? 'text-[#825534] font-bold'
                  : 'text-neutral-500 hover:text-neutral-900'
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {onlyMyDeliveries ? 'Mes livraisons' : 'Toutes'}
            </button>

            {/* Selecteur / Filtre par Livreur */}
            <div className="flex items-center gap-1.5 border-l border-neutral-200 pl-2 text-xs">
              <Truck className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
              <select
                value={selectedDriverFilter}
                onChange={e => setSelectedDriverFilter(e.target.value)}
                className="bg-transparent text-neutral-900 text-xs font-medium outline-none border-none cursor-pointer"
              >
                <option value="ALL" className="bg-white text-neutral-900">Tous les livreurs</option>
                {allAvailableDrivers.map(driverName => (
                  <option key={driverName} value={driverName} className="bg-white text-neutral-900">
                    {driverName}
                  </option>
                ))}
              </select>
              {selectedDriverFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedDriverFilter('ALL')}
                  className="px-1 py-0.5 text-xs font-medium text-neutral-400 hover:text-neutral-900 cursor-pointer"
                  title="Réinitialiser le filtre livreur"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Date Filter & Search */}
          <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
            <div className="flex items-center gap-1.5 border-b border-neutral-200 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-neutral-400" />
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-transparent text-neutral-900 text-xs font-medium outline-none border-none cursor-pointer"
              />
              {filterDate === getTodayDateStr() ? (
                <span className="text-xs font-semibold text-[#825534]">Aujourd'hui</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setFilterDate(getTodayDateStr())}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                >
                  Aujourd'hui
                </button>
              )}
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-900 flex items-center gap-1 ml-1"
                  title="Afficher toutes les dates"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Toutes</span>
                </button>
              )}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Rechercher nom, livreur, tél, N°..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border-0 border-b border-neutral-200 bg-transparent py-1 pl-6 pr-2 text-xs text-neutral-900 placeholder-neutral-400 outline-none focus:border-neutral-900"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Driver Filter Pills ("Filtres livreurs en cours") */}
        {activeDrivers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs border-b border-neutral-200 pb-2">
            <span className="text-neutral-500 font-medium flex items-center gap-1 shrink-0">
              <UserCheck className="h-3.5 w-3.5" /> Course en cours par livreur :
            </span>

            <button
              onClick={() => setSelectedDriverFilter('ALL')}
              className={cx(
                'px-2.5 py-1 text-xs font-medium cursor-pointer',
                selectedDriverFilter === 'ALL'
                  ? 'bg-[#b38059]/15 text-[#825534] font-bold'
                  : 'text-neutral-500 hover:text-neutral-900'
              )}
            >
              Tous ({deliveries.length})
            </button>

            {activeDrivers.map(driverName => {
              const driverInProgCount = deliveries.filter(
                d => (d.deliveryPerson || '').trim().toLowerCase() === driverName.toLowerCase()
                  && d.deliveryStatus === 'IN_DELIVERY'
              ).length;
              const isSelected = selectedDriverFilter.toLowerCase() === driverName.toLowerCase();

              return (
                <button
                  key={driverName}
                  onClick={() => setSelectedDriverFilter(driverName)}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium flex items-center gap-1.5 cursor-pointer',
                    isSelected
                      ? 'bg-[#b38059]/15 text-[#825534] font-bold'
                      : 'text-neutral-500 hover:text-neutral-900'
                  )}
                >
                  <span>🛵 {driverName}</span>
                  <span className="text-xs text-amber-800 font-medium">
                    ({driverInProgCount})
                  </span>
                </button>
              );
            })}

            {selectedDriverFilter !== 'ALL' && (
              <button
                onClick={() => setSelectedDriverFilter('ALL')}
                className="text-xs text-neutral-500 hover:text-neutral-900 underline ml-1 cursor-pointer"
              >
                Effacer filtre livreur
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk Action Banner when items are selected */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-neutral-200 text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 font-semibold text-neutral-900">
            <CheckSquare className="h-4 w-4 text-[#b38059]" />
            <span>{selectedIds.length} livraison(s) sélectionnée(s)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleUpdateStatus(null, null, { action: 'PAY' })}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <DollarSign className="h-3.5 w-3.5" /> Marquer comme Payées
            </button>

            <button
              onClick={() => handleUpdateStatus('IN_DELIVERY')}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Truck className="h-3.5 w-3.5" /> Attribuer Livreur / En cours
            </button>

            <button
              onClick={() => handleUnassignDriver()}
              className="px-3 py-1.5 rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-900 font-medium flex items-center gap-1.5 transition cursor-pointer"
              title="Retirer du livreur et remettre en attente"
            >
              <UserMinus className="h-3.5 w-3.5" /> Retirer du livreur
            </button>

            <button
              onClick={() => openPaymentModal('DELIVERED', 'BULK')}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle className="h-3.5 w-3.5" /> Marquer comme Livrées
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-2 py-1.5 text-neutral-500 hover:text-neutral-900 font-medium cursor-pointer"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError && <div className="p-3"><ErrorState title="Livraisons indisponibles" description={loadError} onRetry={fetchDeliveries} /></div>}
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-white text-xs font-semibold text-neutral-500 border-b border-neutral-200 z-10">
              <tr>
                <th className="px-3 py-2.5 w-10 text-center">
                  <button onClick={toggleSelectAll} className="text-neutral-500 hover:text-neutral-900 cursor-pointer">
                    {displayedDeliveries.length > 0 && selectedIds.length === displayedDeliveries.length ? (
                      <CheckSquare className="h-4 w-4 text-[#b38059]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2.5">N° Livraison</th>
                <th className="px-3 py-2.5">Client & Livreur</th>
                <th className="px-3 py-2.5">Agent / Caissier</th>
                <th className="px-3 py-2.5 hidden sm:table-cell">Adresse</th>
                <th className="px-3 py-2.5 text-right text-emerald-800">Montant Commande</th>
                <th className="px-3 py-2.5 text-right text-sky-800">Frais Livraison</th>
                <th className="px-3 py-2.5 text-right text-[#b38059] font-bold">Total (AVEC Frais)</th>
                <th className="px-3 py-2.5 text-center">Comptabilité & Statut</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading && (
                <tr>
                  <td colSpan={10} className="p-3"><LoadingState label="Chargement des livraisons..." rows={3} /></td>
                </tr>
              )}

              {!loading && displayedDeliveries.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-3"><EmptyState title="Aucune livraison" description="Aucune livraison ne correspond aux filtres sélectionnés." className="border-0 bg-transparent" /></td>
                </tr>
              )}

              {!loading && displayedDeliveries.map(del => {
                const isSelected = selectedIds.includes(del.id);
                const clientName = del.clientName || '—';
                const clientPhone = del.clientPhone || '—';
                const driverName = del.deliveryPerson || null;
                const isPaid = del.isPaid || del.deliveryStatus === 'DELIVERED';

                const itemsAmount = parseFloat(del.totalAmount) || 0;
                const deliveryFee = parseFloat(del.deliveryFee) || 0;
                const totalWithFee = itemsAmount + deliveryFee;

                return (
                  <tr
                    key={del.id}
                    className={cx(
                      'transition-colors',
                      isSelected ? 'bg-[#b38059]/15' : 'hover:bg-neutral-50'
                    )}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => toggleSelect(del.id)} className="text-neutral-500 hover:text-neutral-900 cursor-pointer">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-[#b38059]" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-2.5 font-bold text-[#b38059]">
                      {del.deliveryNo || del.invoiceNumber}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="font-medium text-neutral-900">{clientName}</div>
                      {del.clientPhone && (
                        <div className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 shrink-0" /> {del.clientPhone}
                        </div>
                      )}
                      {driverName && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-800">
                          <span>🛵 Livreur :</span>
                          <span className="font-bold">{driverName}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="font-medium text-neutral-500 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                        <span>{del.createdBy?.name || '—'}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 hidden sm:table-cell text-neutral-500 max-w-xs truncate">
                      {del.deliveryAddress ? (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-neutral-400 shrink-0" /> {del.deliveryAddress}</span>
                      ) : (
                        <span className="text-neutral-400 italic">Non précisée</span>
                      )}
                    </td>

                    {/* 1. Montant Commande (Marchandises uniquement) */}
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                      {formatFCFA(itemsAmount)}
                    </td>

                    {/* 2. Frais Livraison */}
                    <td className="px-3 py-2.5 text-right font-bold text-sky-700">
                      {formatFCFA(deliveryFee)}
                    </td>

                    {/* 3. Total (AVEC Frais) */}
                    <td className="px-3 py-2.5 text-right font-bold text-[#b38059] text-xs">
                      {formatFCFA(totalWithFee)}
                    </td>

                    <td className="px-3 py-2.5 text-center space-y-1">
                      <div>{getPaymentBadge(del)}</div>
                      <div>{getLogisticsBadge(del.deliveryStatus)}</div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* Action 1: Marquer comme Payée (Paiement d'avance / Expédition) */}
                        {!isPaid && del.deliveryStatus !== 'CANCELLED' && (
                          <button
                            onClick={() => handleUpdateStatus(null, del, { action: 'PAY' })}
                            title="Marquer Payée (Encaisser d'avance pour expédition)"
                            className="px-2 py-1 rounded border border-neutral-200 text-emerald-800 hover:bg-neutral-50 transition flex items-center gap-1 text-xs font-medium cursor-pointer"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">Encaisser</span>
                          </button>
                        )}

                        {/* Action 2: Passer en cours (Attribuer livreur) - Si EN ATTENTE ou si LIVRÉE sans livreur assigné (expédition) */}
                        {(del.deliveryStatus === 'PENDING' || (del.deliveryStatus === 'DELIVERED' && !del.deliveryPerson)) && (
                          <button
                            onClick={() => handleUpdateStatus('IN_DELIVERY', del)}
                            title={del.deliveryStatus === 'DELIVERED' ? 'Assigner un livreur (rétroactivement)' : 'Passer en cours de livraison (Attribuer livreur)'}
                            className="px-2 py-1 rounded border border-neutral-200 text-sky-800 hover:bg-neutral-50 transition flex items-center gap-1 text-xs font-medium cursor-pointer"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">{del.deliveryStatus === 'DELIVERED' ? 'Livreur' : 'En cours'}</span>
                          </button>
                        )}

                        {/* Action 3: Retirer du livreur (Désaffecter) */}
                        {driverName && del.deliveryStatus === 'IN_DELIVERY' && (
                          <button
                            onClick={() => handleUnassignDriver(del)}
                            title="Retirer du livreur (Remettre en attente sans annuler)"
                            className="p-1 rounded border border-neutral-200 text-amber-800 hover:bg-neutral-50 transition cursor-pointer"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Action 4: Marquer comme Livrée */}
                        {del.deliveryStatus !== 'DELIVERED' && del.deliveryStatus !== 'CANCELLED' && (
                          <button
                            onClick={() => openPaymentModal('DELIVERED', del)}
                            title="Marquer comme Livrée"
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Print Ticket */}
                        <button
                          onClick={() => triggerPrint(del)}
                          title="Imprimer le bon de livraison"
                          className="p-1 rounded border border-neutral-200 text-neutral-500 hover:text-neutral-900 transition cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>

                        {/* Details View */}
                        <button
                          onClick={() => setSelectedDelivery(del)}
                          title="Détails"
                          className="px-2 py-1 rounded border border-neutral-200 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                        >
                          Voir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white border-t border-neutral-200 text-xs font-bold z-10">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-2.5 text-center text-neutral-500 text-xs animate-pulse">
                    Calcul des totaux...
                  </td>
                </tr>
              ) : (() => {
                const paidDisplayedDeliveries = displayedDeliveries.filter(d => d.isPaid || d.deliveryStatus === 'DELIVERED');
                const paidTotalWithoutFees = paidDisplayedDeliveries.reduce((sum, d) => sum + (parseFloat(d.totalAmount) || 0), 0);
                const paidTotalDeliveryFees = paidDisplayedDeliveries.reduce((sum, d) => sum + (parseFloat(d.deliveryFee) || 0), 0);
                const paidTotalWithFees = paidTotalWithoutFees + paidTotalDeliveryFees;

                return (
                  <tr>
                    <td colSpan={5} className="px-3 py-2.5 text-neutral-900 font-bold">
                      TOTAL ENCAISSÉ ({paidDisplayedDeliveries.length}/{displayedDeliveries.length} livraison{displayedDeliveries.length > 1 ? 's' : ''})
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700 text-xs">
                      {formatFCFA(paidTotalWithoutFees)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-sky-700 text-xs">
                      {formatFCFA(paidTotalDeliveryFees)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-[#b38059] text-xs">
                      {formatFCFA(paidTotalWithFees)}
                    </td>
                    <td colSpan={2} className="px-3 py-2.5 text-center text-neutral-500 font-normal text-xs">
                      Uniquement livraisons encaissées
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Driver Assignment Modal (When marking IN_DELIVERY) */}
      {driverModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded max-w-md w-full p-6 space-y-4 relative">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Truck className="h-5 w-5 text-sky-600" />
              {targetInDeliveryItem === 'BULK'
                ? `Attribution du livreur (${selectedIds.length} livraisons)`
                : targetInDeliveryItem?.deliveryStatus === 'DELIVERED'
                  ? 'Assigner un livreur (livraison déjà livrée)'
                  : 'Attribution du livreur'}
            </h3>

            <p className="text-xs text-neutral-500 leading-relaxed">
              {targetInDeliveryItem?.deliveryStatus === 'DELIVERED'
                ? <>Cette livraison est déjà marquée comme <strong>livrée</strong>. Assignez un livreur pour l'associer dans les statistiques. Le statut ne changera pas.
                  <span className="block mt-1 text-[#b38059]">Utile pour les expéditions payées d'avance.</span>
                </>
                : 'Précisez le nom du livreur qui prend en charge la livraison. Un filtre temporaire avec son nom sera créé automatiquement.'
              }
            </p>

            {/* Input with Auto-complete */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-neutral-500" /> Nom du livreur :
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="Tapez le nom du livreur..."
                  value={driverInput}
                  onChange={e => {
                    setDriverInput(e.target.value);
                    setShowDriverSuggestions(true);
                  }}
                  onFocus={() => setShowDriverSuggestions(true)}
                  className="w-full border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 placeholder-neutral-400 outline-none focus:border-neutral-900"
                />

                {/* Suggestions dropdown */}
                {showDriverSuggestions && matchingDriverSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-200 max-h-48 overflow-y-auto z-50 divide-y divide-neutral-200">
                    {matchingDriverSuggestions.map(driver => (
                      <button
                        key={driver.id || driver.name}
                        type="button"
                        onClick={() => {
                          setDriverInput(driver.name);
                          setShowDriverSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-neutral-900 hover:bg-neutral-50 font-medium flex items-center justify-between cursor-pointer"
                      >
                        <span>🛵 {driver.name}</span>
                        {driver.phone && <span className="text-xs text-neutral-500">{driver.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                disabled={submitting}
                onClick={() => setDriverModalOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-200 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={submitting || !driverInput.trim()}
                onClick={confirmDriverAssignment}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {submitting ? 'Enregistrement...' : (
                  targetInDeliveryItem?.deliveryStatus === 'DELIVERED'
                    ? 'Assigner le livreur'
                    : 'Valider & Passer en cours'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Marking as PAYEE or DELIVERED (Confirms Payment Method) */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              {paymentActionType === 'PAY_ONLY' ? 'Enregistrement du Paiement d\'avance' : 'Validation de la livraison'}
            </h3>

            <p className="text-xs text-neutral-500 leading-relaxed">
              Confirmation comptable : Le passage au statut <strong>PAYÉE</strong> va intégrer immédiatement le montant dans la comptabilité et le rapport Z.
            </p>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-900">Confirmer le mode de règlement :</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: 'Espèces' },
                  { id: 'ONLINE', label: 'Mobile Money' },
                  { id: 'ORANGE_MONEY', label: 'Orange Money' }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={cx(
                      'py-2 px-2 text-xs font-medium text-center cursor-pointer transition-colors',
                      paymentMethod === m.id
                        ? 'bg-[#b38059]/15 text-[#825534] font-bold'
                        : 'text-neutral-500 hover:text-neutral-900'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                disabled={submitting}
                onClick={() => setPaymentModalOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-200 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={submitting}
                onClick={() => {
                  if (paymentActionType === 'PAY_ONLY') {
                    handleUpdateStatus(null, null, { action: 'PAY', paymentConfirmed: true });
                  } else {
                    handleUpdateStatus('DELIVERED', null, { paymentConfirmed: true });
                  }
                }}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {submitting ? 'Validation...' : 'Valider et Entrer en Compta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Drawer */}
      {selectedDelivery && (
        <div className="fixed inset-0 bg-neutral-900/30 z-50 flex items-center justify-end">
          <div className="bg-white border-l border-neutral-200 w-full max-w-lg h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-bold text-[#b38059]">Livraison N° {selectedDelivery.deliveryNo || selectedDelivery.invoiceNumber}</h3>
                  <div className="text-xs text-neutral-500">{new Date(selectedDelivery.createdAt).toLocaleString('fr-FR')}</div>
                </div>
                <button
                  onClick={() => setSelectedDelivery(null)}
                  className="text-neutral-500 hover:text-neutral-900 text-xl cursor-pointer"
                >✕</button>
              </div>

              {/* Status & Client & Driver Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Statut Comptable :</span>
                  <div>{getPaymentBadge(selectedDelivery)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Statut Logistique :</span>
                  <div>{getLogisticsBadge(selectedDelivery.deliveryStatus)}</div>
                </div>

                <div className="border-t border-b border-neutral-200 py-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-neutral-400 shrink-0" />
                    <span className="font-medium text-neutral-900">{selectedDelivery.clientName || 'Client non spécifié'}</span>
                  </div>
                  {selectedDelivery.clientPhone && (
                    <div className="flex items-center gap-2 text-emerald-700">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{selectedDelivery.clientPhone}</span>
                    </div>
                  )}
                  {selectedDelivery.deliveryAddress && (
                    <div className="flex items-center gap-2 text-neutral-500">
                      <MapPin className="h-4 w-4 text-neutral-400 shrink-0" />
                      <span>{selectedDelivery.deliveryAddress}</span>
                    </div>
                  )}
                  {selectedDelivery.deliveryPerson && (
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                      <div className="flex items-center gap-2 text-sky-800 font-medium">
                        <Truck className="h-4 w-4 shrink-0" />
                        <span>Livreur attribué : <strong>{selectedDelivery.deliveryPerson}</strong></span>
                      </div>
                      <button
                        onClick={() => {
                          const del = selectedDelivery;
                          setSelectedDelivery(null);
                          handleUnassignDriver(del);
                        }}
                        className="px-2 py-0.5 text-xs text-amber-800 hover:text-neutral-900 cursor-pointer"
                      >
                        Retirer du livreur
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500">Articles commandés</div>
                <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
                  {selectedDelivery.items?.map((item, idx) => (
                    <div key={item.id || idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-neutral-900">{item.categoryName}</div>
                        <div className="text-xs text-neutral-500">{formatFCFA(item.price)} x {item.qty || 1}</div>
                      </div>
                      <div className="font-bold text-[#b38059]">
                        {formatFCFA(item.price * (item.qty || 1))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Payment Method */}
              <div className="border-t border-b border-neutral-200 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-500">Total Articles (Comptabilité)</div>
                    <div className="text-xs text-neutral-500">Règlement : {selectedDelivery.paymentMethod || 'Espèces'}</div>
                  </div>
                  <div className="text-base font-bold text-[#b38059]">
                    {formatFCFA(selectedDelivery.totalAmount)}
                  </div>
                </div>

                {Number(selectedDelivery.deliveryFee || 0) > 0 && (
                  <>
                    <div className="border-t border-neutral-200 pt-2 flex items-center justify-between text-xs font-medium">
                      <span className="text-sky-800">🚚 Frais de transport :</span>
                      <span className="text-sky-800">{formatFCFA(selectedDelivery.deliveryFee)}</span>
                    </div>
                    <div className="border-t border-neutral-200 pt-2 flex items-center justify-between text-xs font-bold">
                      <span className="text-neutral-900">TOTAL À PAYER PAR LE CLIENT :</span>
                      <span className="text-emerald-700">{formatFCFA(Number(selectedDelivery.totalAmount) + Number(selectedDelivery.deliveryFee))}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => triggerPrint(selectedDelivery)}
                className="px-3 py-1.5 rounded border border-neutral-200 hover:bg-neutral-50 text-xs font-medium text-neutral-900 flex items-center gap-2 cursor-pointer"
              >
                <Printer className="h-4 w-4 text-neutral-500" /> Ticket
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {!selectedDelivery.isPaid && selectedDelivery.deliveryStatus !== 'DELIVERED' && (
                  <button
                    onClick={() => {
                      const del = selectedDelivery;
                      setSelectedDelivery(null);
                      handleUpdateStatus(null, del, { action: 'PAY' });
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <DollarSign className="h-4 w-4" /> Encaisser d'avance
                  </button>
                )}

                {(selectedDelivery.deliveryStatus === 'PENDING' || (selectedDelivery.deliveryStatus === 'DELIVERED' && !selectedDelivery.deliveryPerson)) && (
                  <button
                    onClick={() => {
                      const del = selectedDelivery;
                      setSelectedDelivery(null);
                      openInDeliveryModal(del);
                    }}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Truck className="h-4 w-4" />
                    {selectedDelivery.deliveryStatus === 'DELIVERED' ? 'Assigner livreur' : 'Passer en cours'}
                  </button>
                )}

                {selectedDelivery.deliveryStatus !== 'DELIVERED' && (
                  <button
                    onClick={() => {
                      const del = selectedDelivery;
                      setSelectedDelivery(null);
                      openPaymentModal('DELIVERED', del);
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="h-4 w-4" /> Marquer Livrée
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Formulaire : Créer une Livraison */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded max-w-xl w-full p-6 space-y-4 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h3 className="text-sm font-bold text-[#b38059] flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#b38059]" />
                Créer une nouvelle livraison
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-900 text-lg cursor-pointer"
              >✕</button>
            </div>

            {/* Form Section 1: Selection Articles */}
            <div className="space-y-3 border-b border-neutral-200 pb-4">
              <div className="text-xs font-semibold text-[#b38059] flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4" /> Sélection des articles
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-500">Article / Catégorie</label>
                  <select
                    value={selectedCategoryId}
                    onChange={e => handleCategorySelectChange(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                  >
                    <option value="">-- Choisir un article --</option>
                    {categoriesList.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({formatFCFA(cat.price)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-500">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={itemQty}
                    onChange={e => setItemQty(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs font-bold text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-neutral-500">Prix unitaire :</label>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={e => setItemPrice(e.target.value)}
                    className="w-28 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs font-bold text-[#b38059] outline-none focus:border-neutral-900"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddItemToCart}
                  className="px-3 py-1.5 rounded bg-[#b38059] hover:bg-[#9d6f4b] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter l'article
                </button>
              </div>

              {/* Cart Items Table */}
              {createCart.length > 0 && (
                <div className="mt-2 border-t border-b border-neutral-200 divide-y divide-neutral-200">
                  {createCart.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-neutral-900">{item.categoryName}</div>
                        <div className="text-xs text-neutral-500">{formatFCFA(item.price)} x {item.qty}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-emerald-700">{formatFCFA(item.price * item.qty)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItemFromCart(idx)}
                          className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="py-2 flex items-center justify-between font-bold text-xs">
                    <span className="text-neutral-500">Sous-total articles :</span>
                    <span className="text-emerald-700 text-sm">
                      {formatFCFA(createCart.reduce((sum, i) => sum + (i.price * i.qty), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Form Section 2: Info Client & Livraison */}
            <div className="space-y-3 border-b border-neutral-200 pb-4">
              <div className="text-xs font-semibold text-[#b38059] flex items-center gap-1.5">
                <User className="h-4 w-4" /> Information client & destination
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-medium text-neutral-500">Nom du client *</label>
                  <input
                    type="text"
                    placeholder="Nom complet..."
                    value={createClientName}
                    onChange={e => setCreateClientName(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500">Téléphone client *</label>
                  <input
                    type="tel"
                    placeholder="Numéro de tél..."
                    value={createClientPhone}
                    onChange={e => setCreateClientPhone(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-500">Adresse de livraison</label>
                  <input
                    type="text"
                    placeholder="Quartier, point de repère..."
                    value={createDeliveryAddress}
                    onChange={e => setCreateDeliveryAddress(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-sky-800">Frais de livraison (FCFA)</label>
                  <input
                    type="number"
                    placeholder="Ex: 1000"
                    value={createDeliveryFee}
                    onChange={e => setCreateDeliveryFee(e.target.value)}
                    className="w-full mt-1 border-0 border-b border-neutral-200 bg-transparent py-1 text-xs font-bold text-sky-800 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
            </div>

            {/* Form Section 3: Mode de paiement */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-900">Mode de règlement :</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: 'Espèces' },
                  { id: 'ONLINE', label: 'Mobile Money' },
                  { id: 'ORANGE_MONEY', label: 'Orange Money' }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCreatePaymentMethod(m.id)}
                    className={cx(
                      'py-2 px-2 text-xs font-medium text-center cursor-pointer transition-colors',
                      createPaymentMethod === m.id
                        ? 'bg-[#b38059]/15 text-[#825534] font-bold'
                        : 'text-neutral-500 hover:text-neutral-900'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary & Submit */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-neutral-500 font-medium">Total Général à Payer</div>
                <div className="text-xl font-bold text-[#b38059] tabular-nums">
                  {formatFCFA(
                    createCart.reduce((sum, i) => sum + (i.price * i.qty), 0) + (parseFloat(createDeliveryFee) || 0)
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isCreatingDelivery}
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-neutral-200 text-xs font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={isCreatingDelivery || createCart.length === 0}
                  onClick={handleCreateDeliverySubmit}
                  className="px-4 py-2 rounded bg-[#b38059] hover:bg-[#9d6f4b] disabled:opacity-45 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer"
                >
                  {isCreatingDelivery ? 'Création...' : 'Valider & Créer la livraison'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}