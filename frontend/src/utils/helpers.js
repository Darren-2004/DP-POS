export const isReservationInvoice = (inv) => {
  if (!inv || typeof inv !== 'object') return false;
  if (inv.isReservation === true || inv.isReservation === 1 || inv.isReservation === '1' || inv.isReservation === 'true') return true;
  if (inv.isReservationInvoice === true || inv.isReservationInvoice === 1 || inv.isReservationInvoice === '1' || inv.isReservationInvoice === 'true') return true;
  if (inv.reservationNo && String(inv.reservationNo).trim().length > 0) return true;
  if (inv.invoiceNumber && String(inv.invoiceNumber).startsWith('RES-')) return true;
  return false;
};

export const isDeliveryInvoice = (inv) => {
  if (!inv || typeof inv !== 'object') return false;
  if (inv.isDelivery === true || inv.isDelivery === 1 || inv.isDelivery === '1' || inv.isDelivery === 'true') return true;
  if (inv.deliveryNo && String(inv.deliveryNo).trim().length > 0) return true;
  if (inv.deliveryStatus && String(inv.deliveryStatus).trim().length > 0) return true;
  if (inv.invoiceNumber && String(inv.invoiceNumber).startsWith('LIV-')) return true;
  return false;
};

export const formatFCFA = (amount = 0) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' FCFA';

export const cx = (...classes) => classes.filter(Boolean).join(' ');

export const apiFetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  try {
    const user = JSON.parse(localStorage.getItem('pos_user') || 'null');
    if (user?.accessToken) headers.set('Authorization', `Bearer ${user.accessToken}`);
  } catch {
    // Missing or malformed local session data should not prevent public requests.
  }
  return fetch(input, { ...init, headers });
};

export const getTodayDateStr = (dateObj = new Date()) => {
  const now = dateObj instanceof Date ? dateObj : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPaymentMethodLabel = (method) => {
  const methodStr = String(method || '').trim();
  if (methodStr.startsWith('MULTIPLE:')) {
    const parts = methodStr.substring(9).split(';');
    const labels = parts.map(part => {
      const [key, val] = part.split('=');
      const k = String(key || '').trim().toUpperCase();
      const v = parseFloat(val) || 0;
      let label = '';
      if (k === 'CASH') label = 'Espèces';
      else if (k === 'ONLINE') label = 'Mobile Money';
      else if (k === 'ORANGE_MONEY') label = 'Orange Money';
      else label = k;
      return `${label}: ${new Intl.NumberFormat('fr-FR').format(v)} FCFA`;
    });
    return labels.join(', ');
  }
  if (method === 'CASH') return 'Espèces';
  if (method === 'ONLINE') return 'Mobile Money';
  if (method === 'ORANGE_MONEY') return 'Orange Money';
  return 'Non précisé';
};

export const showToast = (message, type = 'success') => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos:toast', { detail: { message, type } }));
  }
};

export const renderPaymentMethodHTML = (method) => {
  const methodStr = String(method || '').trim();
  if (methodStr.startsWith('MULTIPLE:')) {
    const parts = methodStr.substring(9).split(';');
    const lines = parts.map(part => {
      const [key, val] = part.split('=');
      const k = String(key || '').trim().toUpperCase();
      const v = parseFloat(val) || 0;
      let label = '';
      if (k === 'CASH') label = 'Espèces';
      else if (k === 'ONLINE') label = 'Mobile Money';
      else if (k === 'ORANGE_MONEY') label = 'Orange Money';
      else label = k;
      return `<div style="display:flex;justify-content:space-between;gap:4px;padding-left:8px;font-size:10pt;font-weight:bold;color:#000;margin:2px 0;">
        <span>• ${label} :</span>
        <span>${new Intl.NumberFormat('fr-FR').format(v)} FCFA</span>
      </div>`;
    });
    return `<div style="margin:4px 0;padding:3px 0;border-top:1px solid #000;border-bottom:1px solid #000;color:#000;">
      <div style="font-size:10pt;font-weight:900;margin-bottom:2px;">RÈGLEMENT :</div>
      ${lines.join('')}
    </div>`;
  }

  // Single method
  let label = 'Non précisé';
  if (methodStr === 'CASH') label = 'Espèces';
  else if (methodStr === 'ONLINE') label = 'Mobile Money';
  else if (methodStr === 'ORANGE_MONEY') label = 'Orange Money';
  return `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin:4px 0;padding:3px 0;border-top:1px solid #000;border-bottom:1px solid #000;font-size:10pt;font-weight:900;color:#000;">
    <span>RÈGLEMENT :</span>
    <span>${label}</span>
  </div>`;
};

let lastPrintedId = null;
let lastPrintTimestamp = 0;
let isPrintingBusy = false;
const printDispatchGuard = new Map();

const registerPrintDispatch = (documentType, documentId) => {
  if (!documentId) return true;
  const key = `${documentType}:${documentId}`;
  const now = Date.now();
  const previousTime = printDispatchGuard.get(key);

  if (previousTime && now - previousTime < 5000) {
    showToast('Une impression identique est déjà en cours pour ce document.', 'info');
    return false;
  }

  printDispatchGuard.set(key, now);
  setTimeout(() => {
    if (printDispatchGuard.get(key) === now) {
      printDispatchGuard.delete(key);
    }
  }, 5000);

  return true;
};

const getCurrentPrintStationId = () =>
  typeof localStorage === 'undefined' ? '' : localStorage.getItem('pos_station_id_v2') || '';

const publishPrintJobStatus = (jobId, stationId, status, error = '', waiting = false) => {
  window.dispatchEvent(new CustomEvent('pos:print-job-status', {
    detail: { jobId, stationId, status, error, waiting }
  }));
};

export const watchPrintJob = (jobId, stationId) => {
  const startedAt = Date.now();
  let lastStatus = 'queued';
  publishPrintJobStatus(jobId, stationId, lastStatus);
  const checkStatus = async () => {
    try {
      const query = new URLSearchParams({ station_id: stationId });
      const response = await fetch(`/api/print/jobs/${encodeURIComponent(jobId)}?${query}`);
      if (!response.ok) throw new Error('Impossible de vérifier l’impression');
      const job = await response.json();
      lastStatus = job.status;
      publishPrintJobStatus(jobId, stationId, job.status, job.error || '');
      if (job.status === 'printed') {
        showToast('Ticket imprimé sur cette caisse.', 'success');
        return;
      }
      if (job.status === 'failed' || job.status === 'unknown') {
        showToast(job.status === 'unknown'
          ? 'Impression à vérifier : le ticket est ancien ou son résultat est incertain.'
          : `Impression impossible : ${job.error || 'vérifiez l’imprimante.'}`, 'error');
        return;
      }
      if (Date.now() - startedAt < 30000) {
        setTimeout(checkStatus, 400);
      } else {
        publishPrintJobStatus(jobId, stationId, lastStatus, '', true);
        showToast('Ticket toujours en attente sur cette caisse.', 'info');
      }
    } catch (error) {
      publishPrintJobStatus(jobId, stationId, lastStatus, error.message || 'État d’impression indisponible.');
      showToast(error.message || 'État d’impression indisponible.', 'error');
    }
  };
  setTimeout(checkStatus, 150);
};

export const getPrintMode = () => {
  return localStorage.getItem('pos_print_mode_v2') || 'BROWSER_DIRECT';
};

export const setPrintMode = (mode) => {
  localStorage.setItem('pos_print_mode_v2', mode);
  window.dispatchEvent(new CustomEvent('pos:print-mode-changed', { detail: mode }));
};

export const printHTMLDirectly = (htmlContent) => {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Focus/print error:', e);
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 200);
    showToast('Ticket imprimé (Mode Direct Navigateur).', 'success');
  } catch (err) {
    console.error('Direct print error:', err);
    showToast(`Erreur d’impression : ${err.message}`, 'error');
  }
};

const dispatchPrint = (htmlContent, payload, documentType, documentId) => {
  if (!registerPrintDispatch(documentType, documentId)) {
    return;
  }

  const mode = getPrintMode();
  if (mode === 'PRINT_AGENT') {
    enqueuePrintJob(payload, documentType, documentId);
  } else {
    printHTMLDirectly(htmlContent);
  }
};

const enqueuePrintJob = async (payload, documentType, documentId) => {
  const existingPrintJob = payload.printJob || payload.invoiceData?.printJob;
  const stationId = existingPrintJob?.stationId || getCurrentPrintStationId();
  if (!stationId) {
    showToast('Choisissez la caisse de cette imprimante avant d’imprimer.', 'warning');
    return;
  }
  if (existingPrintJob?.jobId) {
    watchPrintJob(existingPrintJob.jobId, stationId);
    return;
  }
  try {
    const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        stationId,
        idempotencyKey: `${documentType}:${documentId || 'document'}:${randomId}`,
      })
    });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || job.detail || 'Imprimante indisponible');
    showToast('Ticket envoyé à l’imprimante de cette caisse.', 'info');
    watchPrintJob(job.jobId, stationId);
  } catch (error) {
    showToast(`Échec de mise en file d’impression : ${error.message}`, 'error');
  }
};

// ─── Normal Cashier Sales Receipt Print ──────────────────────────────────────
export const triggerPrint = (invoiceData) => {
  if (isPrintingBusy) {
    showToast("⏳ Impression déjà en cours, veuillez patienter...", "info");
    return;
  }
  if (lastPrintedId === invoiceData.id && (Date.now() - lastPrintTimestamp < 3000)) {
    console.log("Ignored duplicate print click");
    return;
  }
  lastPrintedId = invoiceData.id;
  lastPrintTimestamp = Date.now();
  isPrintingBusy = true;

  const isZ = invoiceData.isZReport;

  const groupItems = (items = []) => {
    const map = {};
    items.forEach(item => {
      const key = `${item.categoryName}||${item.price}`;
      if (!map[key]) map[key] = { categoryName: item.categoryName, price: item.price, qty: 0 };
      map[key].qty += 1;
    });
    return Object.values(map);
  };

  const itemsRows = `
    <div style="width:100%; margin:4px 0; font-size:8.5pt;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1.5px solid #000; padding-bottom:2px;">
        <span style="flex:1; text-align:left;">Désignation</span>
        <span style="width:180px; display:flex; justify-content:space-between;">
          <span style="width:40px; text-align:center;">Qté</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">P/U</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">Total</span>
        </span>
      </div>
      <!-- Items -->
      ${groupItems(invoiceData.items || []).map(item => `
        <div style="display:flex; justify-content:space-between; border-bottom:0.5px solid #eee; padding:3px 0; align-items:flex-start;">
          <span style="flex:1; text-align:left; word-break:break-word; overflow-wrap:break-word; padding-right:4px;">${item.categoryName}</span>
          <span style="width:180px; display:flex; justify-content:space-between; flex-wrap:wrap; align-items:flex-start;">
            <span style="width:40px; text-align:center;">${item.qty}</span>
            <span style="width:10px; text-align:center;">|</span>
            <span style="width:60px; text-align:right;">${Math.round(item.price).toLocaleString('fr-FR')}</span>
            <span style="width:10px; text-align:center;">|</span>
            <span style="width:60px; text-align:right; font-weight:bold; word-break:break-all;">${Math.round(item.price * item.qty).toLocaleString('fr-FR')}</span>
          </span>
        </div>
      `).join('')}
    </div>`;

  const clientNameStr = invoiceData.clientName || '';
  let clientPhoneStr = invoiceData.clientPhone || '';

  // Extract phone if embedded in name
  if (!clientPhoneStr && clientNameStr.includes('(') && clientNameStr.includes(')')) {
    const match = clientNameStr.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      invoiceData.clientName = match[1].trim();
      clientPhoneStr = match[2].trim();
    }
  }

  const clientNameOnly = invoiceData.clientName || '';
  const hasName = clientNameOnly && clientNameOnly !== 'Client de passage';
  const hasPhone = Boolean(clientPhoneStr);

  const isDelivery = isDeliveryInvoice(invoiceData);
  const isReservation = isReservationInvoice(invoiceData);

  let deliveryStatusLabel = 'ENREGISTRÉE';
  if (invoiceData.deliveryStatus === 'IN_DELIVERY') deliveryStatusLabel = 'EN COURS DE LIVRAISON';
  else if (invoiceData.deliveryStatus === 'DELIVERED') deliveryStatusLabel = 'LIVRÉE';
  else if (invoiceData.deliveryStatus === 'CANCELLED') deliveryStatusLabel = 'ANNULÉE';

  const printHTML = isZ ? `
    <div style="text-align:center;margin-bottom:8px;">
      <h2 style="margin:0;font-size:16pt;letter-spacing:2px;">DIMITRI PERFECT</h2>
      <h3 style="margin:2px 0;font-size:11pt;">RAPPORT DE CLÔTURE (Z)</h3>
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
    </div>
    <div style="font-size:9pt;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Date:</span><span style="white-space:nowrap;">${invoiceData.zReport.date} ${invoiceData.zReport.time}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Opérateur:</span><span style="word-break:break-word;">${invoiceData.zReport.cashierName || invoiceData.createdBy?.name || 'Admin'}</span></div>
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
      <div style="font-weight:bold;font-size:10pt;margin-bottom:4px;">SYNTHÈSE COMPTABLE</div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:11pt;font-weight:bold;margin:4px 0;"><span>TOTAL NET:</span><span>${Math.round(invoiceData.zReport.totalSales).toLocaleString('fr-FR')} FCFA</span></div>
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Espèces:</span><span>${Math.round(invoiceData.zReport.totalCash || invoiceData.zReport.payments?.CASH || 0).toLocaleString('fr-FR')} FCFA</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Mobile Money:</span><span>${Math.round(invoiceData.zReport.totalOnline || invoiceData.zReport.payments?.ONLINE || 0).toLocaleString('fr-FR')} FCFA</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Orange Money:</span><span>${Math.round(invoiceData.zReport.payments?.ORANGE_MONEY || 0).toLocaleString('fr-FR')} FCFA</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Ventes Validées:</span><span>${invoiceData.zReport.validatedCount}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Ventes Annulées:</span><span>${invoiceData.zReport.cancelledCount}</span></div>
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
      <div style="font-weight:bold;font-size:10pt;margin-bottom:4px;">RÉPARTITION PAR CATÉGORIE</div>
      ${(invoiceData.zReport.topSelling || []).map(cat => `
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;word-break:break-word;">
          <span style="flex:1;min-width:0;word-break:break-word;">${cat.name} (x${cat.quantity})</span>
          <span style="word-break:break-all;margin-left:4px;">${Math.round(cat.revenue).toLocaleString('fr-FR')} FCFA</span>
        </div>`).join('')}
      <p style="text-align:center;margin-top:16px;font-size:9pt;font-weight:bold;">--- FIN DU RAPPORT Z ---</p>
    </div>
  ` : `
    <div style="text-align:center;margin-bottom:2px;">
      <h2 style="margin:0;font-size:16pt;font-weight:bold;letter-spacing:2px;">DIMITRI PERFECT</h2>
      <p style="margin:2px 0;font-size:9pt;letter-spacing:1px;font-weight:bold;">${isDelivery ? '─── BON DE LIVRAISON ───' : (isReservation ? '─── FACTURE DE RÉSERVATION ───' : '─── TICKET DE CAISSE ───')}</p>
      <p style="margin:2px 0;font-size:8.5pt;font-weight:bold;">NIU: P079216781512Z</p>
    </div>
    <p style="margin:3px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="font-size:9pt;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>N° ${isDelivery ? 'Livraison' : (isReservation ? 'Facture Résa' : 'Ticket')}:</span>
        <span style="font-weight:bold;word-break:break-all;">${isDelivery && invoiceData.deliveryNo ? invoiceData.deliveryNo : invoiceData.invoiceNumber}</span>
      </div>
      ${isDelivery ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>Statut Livraison:</span>
        <span style="font-weight:bold;border:1px solid #000;padding:0 3px;">${deliveryStatusLabel}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Date:</span><span style="white-space:nowrap;">${new Date(invoiceData.createdAt).toLocaleString('fr-FR')}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Caissière:</span><span style="word-break:break-word;">${invoiceData.createdBy?.name || 'Caissière'}</span></div>
      ${renderPaymentMethodHTML(invoiceData.paymentMethod)}
      ${hasName ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>Nom client:</span>
        <span style="font-weight:bold;word-break:break-word;text-align:right;flex:1;min-width:0;">${clientNameStr}</span>
      </div>` : ''}
      ${hasPhone ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>Tél client:</span>
        <span style="font-weight:bold;word-break:break-all;text-align:right;">${clientPhoneStr}</span>
      </div>` : ''}
      ${isDelivery && invoiceData.deliveryAddress ? `
      <div style="margin:4px 0;padding:3px;border:1px dashed #000;font-size:8.5pt;">
        <span>Adresse livraison:</span>
        <div style="font-weight:bold;word-break:break-word;margin-top:1px;">${invoiceData.deliveryAddress}</div>
      </div>` : ''}
      ${isDelivery && invoiceData.deliveryPerson ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>Livreur:</span>
        <span style="font-weight:bold;word-break:break-word;text-align:right;">${invoiceData.deliveryPerson}</span>
      </div>` : ''}
    </div>
    <p style="margin:5px 0;border-bottom:1.5px dashed #000;"></p>
    ${itemsRows}
    <p style="margin:5px 0;border-top:2px solid #000;border-bottom:2px solid #000;"></p>
    ${(isDelivery && Number(invoiceData.deliveryFee || 0) > 0) ? `
      <div style="font-size:9.5pt;font-weight:bold;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:3px;">
        <span>Sous-total articles:</span><span>${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="font-size:9.5pt;font-weight:bold;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:2px;">
        <span>Frais de transport:</span><span>${Math.round(invoiceData.deliveryFee).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <p style="margin:4px 0;border-top:1px dashed #000;"></p>
      <div style="font-size:11pt;font-weight:bold;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:3px;">
        <span>TOTAL À PAYER:</span><span style="word-break:break-all;">${Math.round(Number(invoiceData.totalAmount) + Number(invoiceData.deliveryFee)).toLocaleString('fr-FR')} FCFA</span>
      </div>
    ` : `
      <div style="font-size:11pt;font-weight:bold;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:5px;">
        <span>TOTAL À PAYER:</span><span style="word-break:break-all;">${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `}
    <p style="text-align:center;margin-top:10px;font-size:8.5pt;font-weight:bold;border-top:1px dashed #000;padding-top:6px;margin-bottom:4px;">
      Un article vendu n'est ni remboursable ni changeable
    </p>
    <p style="text-align:center;margin-top:6px;font-size:9pt;font-weight:bold;">Merci de votre visite !</p>
    <div style="text-align:center;margin-top:8px;font-size:7.5pt;color:#000;font-weight:bold;">Fait par © TriSpark Digital1</div>
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket POS</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; }
          html, body {
            width: 70mm;
            margin: 0 auto;
            padding: 0;
            font-family: 'Consolas', 'Lucida Console', 'Courier New', monospace;
            font-size: 8.5pt;
            letter-spacing: -0.2px;
            line-height: 1.2;
            color: #000;
            background: #fff;
            word-break: break-word;
            overflow-wrap: break-word;
            -webkit-print-color-adjust: exact;
          }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 8.5pt; table-layout: fixed; }
          th { padding: 2px 1px; font-weight: bold; border-bottom: 2px solid #000; word-break: break-word; }
          td { padding: 2px 1px; word-break: break-word; }
        </style>
      </head>
      <body>${printHTML}</body>
    </html>`;

  dispatchPrint(fullHtml, { invoiceData }, 'receipt', invoiceData.id);
  setTimeout(() => { isPrintingBusy = false; }, 2000);
};

export const triggerProformaPrint = (reservation) => {
  const now = Date.now();
  if (isPrintingBusy || now - lastPrintTimestamp < 3000) {
    showToast("⏳ Impression déjà en cours, veuillez patienter...", "info");
    return;
  }
  isPrintingBusy = true;
  lastPrintTimestamp = now;

  const payments = reservation.payments || [];
  const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
  const lastPaymentAmount = lastPayment ? (Number(lastPayment.amount) || 0) : 0;

  const paymentsList = payments.map((p, idx) => {
    const isLast = idx === payments.length - 1;
    return `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;${isLast ? 'font-weight:bold;font-size:9.5pt;' : ''}">
        <span>Tranche ${p.installmentNumber || idx + 1}/3 (${getPaymentMethodLabel(p.paymentMethod)})${isLast ? ' (Ce jour)' : ''}:</span>
        <span style="word-break:break-all;font-weight:bold;">${Math.round(p.amount).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `;
  }).join('');

  const itemsList = (reservation.items || []).map(item => `
    <div style="display:flex; justify-content:space-between; border-bottom:0.5px solid #eee; padding:3px 0; align-items:flex-start;">
      <span style="flex:1; text-align:left; word-break:break-word; overflow-wrap:break-word; padding-right:4px;">${item.categoryName}</span>
      <span style="width:180px; display:flex; justify-content:space-between; flex-wrap:wrap; align-items:flex-start;">
        <span style="width:40px; text-align:center;">${item.qty || 1}</span>
        <span style="width:10px; text-align:center;">|</span>
        <span style="width:60px; text-align:right;">${Math.round(item.price).toLocaleString('fr-FR')}</span>
        <span style="width:10px; text-align:center;">|</span>
        <span style="width:60px; text-align:right; font-weight:bold; word-break:break-all;">${Math.round(item.price * (item.qty || 1)).toLocaleString('fr-FR')}</span>
      </span>
    </div>
  `).join('');

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, (Number(reservation.totalAmount) || 0) - totalPaid);

  const printHTML = `
    <div style="text-align:center;margin-bottom:2px;">
      <h2 style="margin:0;font-size:16pt;font-weight:bold;letter-spacing:2px;">DIMITRI PERFECT</h2>
      <p style="margin:2px 0;font-size:9pt;letter-spacing:1px;font-weight:bold;">─── REÇU PROFORMA (RÉSERVATION) ───</p>
      <p style="margin:2px 0;font-size:8.5pt;font-weight:bold;">NIU: P079216781512Z</p>
    </div>
    <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="font-size:9pt;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>N° Réservation:</span><span style="font-weight:bold;word-break:break-all;">${reservation.reservationNo}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Date:</span><span style="white-space:nowrap;">${new Date(reservation.createdAt).toLocaleString('fr-FR')}</span></div>
      ${reservation.clientName ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;">
        <span>Nom client:</span>
        <span style="font-weight:bold;word-break:break-word;text-align:right;flex:1;min-width:0;">${reservation.clientName}</span>
      </div>` : ''}
      ${reservation.clientPhone ? `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;">
        <span>Tél client:</span>
        <span style="font-weight:bold;word-break:break-all;text-align:right;">${reservation.clientPhone}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Enregistré par:</span><span style="word-break:break-word;">${reservation.createdBy?.name || 'Caissière'}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;"><span>Statut:</span><b>${reservation.status === 'COMPLETED' ? 'PAYÉE À 100%' : 'EN COURS DE PAIEMENT'}</b></div>
    </div>
    <p style="margin:6px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="width:100%; margin:4px 0; font-size:8.5pt;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1.5px solid #000; padding-bottom:2px;">
        <span style="flex:1; text-align:left;">Désignation</span>
        <span style="width:180px; display:flex; justify-content:space-between;">
          <span style="width:40px; text-align:center;">Qté</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">P/U</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">Total</span>
        </span>
      </div>
      ${itemsList}
    </div>
    <p style="margin:6px 0;border-top:2px solid #000;border-bottom:2px solid #000;"></p>
    <div style="font-size:9pt;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-weight:bold;font-size:10pt;">
        <span>MONTANT TOTAL:</span><span style="word-break:break-all;">${Math.round(reservation.totalAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
      <div style="font-weight:bold;margin:4px 0 2px 0;">HISTORIQUE DES VERSEMENTS (${reservation.payments?.length || 0}/3):</div>
      ${paymentsList || '<div style="font-style:italic;">Aucun versement effectué</div>'}
      <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:8.5pt;">
        <span>TOTAL DÉJÀ PAYÉ:</span><span style="word-break:break-all;">${Math.round(totalPaid).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:9pt;margin-top:2px;font-weight:bold;">
        <span>RESTE À PAYER:</span><span style="word-break:break-all;">${Math.round(remaining).toLocaleString('fr-FR')} FCFA</span>
      </div>
      ${lastPayment ? `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;font-weight:900;font-size:13pt;margin:8px 0 4px 0;border:2px solid #000;padding:6px;background:#f9f9f9;">
        <span>MONTANT PAYÉ CE JOUR:</span>
        <span style="word-break:break-all;font-size:13pt;">${Math.round(lastPaymentAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>` : ''}
    </div>
    <p style="text-align:center;margin-top:10px;font-size:8.5pt;font-weight:bold;border-top:1px dashed #000;padding-top:6px;margin-bottom:4px;">
      Un article vendu n'est ni remboursable ni changeable
    </p>
    <p style="text-align:center;margin-top:6px;font-size:8.5pt;font-weight:bold;">
      Document Proforma de Réservation.<br>
      La facture définitive est remise après solde complet.<br>
      Merci pour votre confiance - DIMITRI PERFECT
    </p>
    <div style="text-align:center;margin-top:8px;font-size:7.5pt;color:#000;font-weight:bold;">Fait par © TriSpark Digital1</div>
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Réservation POS</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; }
          html, body {
            width: 70mm;
            margin: 0 auto;
            padding: 0;
            font-family: 'Consolas', 'Lucida Console', 'Courier New', monospace;
            font-size: 8.5pt;
            letter-spacing: -0.2px;
            line-height: 1.2;
            color: #000;
            background: #fff;
            word-break: break-word;
            overflow-wrap: break-word;
            -webkit-print-color-adjust: exact;
          }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 8.5pt; table-layout: fixed; }
          th { padding: 2px 1px; font-weight: bold; border-bottom: 2px solid #000; word-break: break-word; }
          td { padding: 2px 1px; word-break: break-word; }
        </style>
      </head>
      <body>${printHTML}</body>
    </html>`;

  dispatchPrint(fullHtml, { reservation }, 'reservation', reservation.id);
  setTimeout(() => { isPrintingBusy = false; }, 2000);
};

// ─── Final Definitive Invoice print (from reservation settlement) ───────────
export const triggerFinalReservationPrint = (invoiceData) => {
  if (isPrintingBusy) {
    showToast("⏳ Impression déjà en cours, veuillez patienter...", "info");
    return;
  }
  isPrintingBusy = true;

  const payments = invoiceData.reservationPayments || [];
  const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
  const lastPaymentAmount = lastPayment ? (Number(lastPayment.amount) || 0) : 0;
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const groupItems = (items = []) => {
    const map = {};
    items.forEach(item => {
      const key = `${item.categoryName}||${item.price}`;
      if (!map[key]) map[key] = { categoryName: item.categoryName, price: item.price, qty: 0 };
      map[key].qty += 1;
    });
    return Object.values(map);
  };

  const itemsRows = `
    <div style="width:100%; margin:4px 0; font-size:8.5pt;">
      <div style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1.5px solid #000; padding-bottom:2px;">
        <span style="flex:1; text-align:left;">Désignation</span>
        <span style="width:180px; display:flex; justify-content:space-between;">
          <span style="width:40px; text-align:center;">Qté</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">P/U</span>
          <span style="width:10px; text-align:center;"></span>
          <span style="width:60px; text-align:right;">Total</span>
        </span>
      </div>
      ${groupItems(invoiceData.items || []).map(item => `
      <div style="display:flex; justify-content:space-between; border-bottom:0.5px solid #eee; padding:3px 0; align-items:flex-start;">
        <span style="flex:1; text-align:left; word-break:break-word; overflow-wrap:break-word; padding-right:4px;">${item.categoryName}</span>
        <span style="width:180px; display:flex; justify-content:space-between; flex-wrap:wrap; align-items:flex-start;">
          <span style="width:40px; text-align:center;">${item.qty}</span>
          <span style="width:10px; text-align:center;">|</span>
          <span style="width:60px; text-align:right;">${Math.round(item.price).toLocaleString('fr-FR')}</span>
          <span style="width:10px; text-align:center;">|</span>
          <span style="width:60px; text-align:right; font-weight:bold; word-break:break-all;">${Math.round(item.price * item.qty).toLocaleString('fr-FR')}</span>
        </span>
      </div>
      `).join('')}
    </div>`;

  const isFullyPaid = totalPaid >= (Number(invoiceData.totalAmount) || 0) - 0.01;
  const paymentsRows = payments.map((p, idx) => {
    const isLast = idx === payments.length - 1;
    const paymentLabel = isFullyPaid && isLast
      ? `Paiement final — Réservation entièrement payée (${getPaymentMethodLabel(p.paymentMethod)})`
      : `Tranche ${p.installmentNumber || idx + 1}/3 (${getPaymentMethodLabel(p.paymentMethod)})${isLast ? ' (Ce jour)' : ''}`;
    return `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:3px 0;font-size:8.5pt;${isLast ? 'font-weight:bold;' : ''}">
        <span>${paymentLabel}:</span>
        <span style="font-weight:bold;word-break:break-all;">${Math.round(p.amount).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `;
  }).join('');

  const printHTML = `
    <div style="text-align:center;margin-bottom:2px;">
      <h2 style="margin:0;font-size:16pt;font-weight:bold;letter-spacing:2px;">DIMITRI PERFECT</h2>
      <p style="margin:2px 0;font-size:9pt;letter-spacing:1px;font-weight:bold;">─── FACTURE DÉFINITIVE ───</p>
      <p style="margin:2px 0;font-size:8.5pt;font-weight:bold;">NIU: P079216781512Z</p>
    </div>
    <p style="margin:3px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="font-size:8.5pt;background:#f0f0f0;padding:4px 3px;border-radius:3px;margin-bottom:4px;text-align:center;font-weight:bold;">
       SOLDE FINAL — Réservation N° ${invoiceData.sourceReservationNo || ''}
    </div>
    <div style="font-size:9pt;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;">
        <span>N° Facture:</span>
        <span style="font-weight:bold;word-break:break-all;">${invoiceData.invoiceNumber}</span>
      </div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Date:</span><span>${new Date(invoiceData.createdAt).toLocaleString('fr-FR')}</span></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Caissière:</span><span>${invoiceData.createdBy?.name || 'Caissière'}</span></div>
      ${invoiceData.clientName ? `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Client:</span><span style="font-weight:bold;word-break:break-word;">${invoiceData.clientName}</span></div>` : ''}
      ${invoiceData.clientPhone ? `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:2px 0;"><span>Tél:</span><span style="font-weight:bold;">${invoiceData.clientPhone}</span></div>` : ''}
    </div>
    <p style="margin:5px 0;border-bottom:1.5px dashed #000;"></p>
    ${itemsRows}
    <p style="margin:5px 0;border-top:2px solid #000;border-bottom:2px solid #000;"></p>
    <div style="font-size:11pt;font-weight:bold;display:flex;justify-content:space-between;flex-wrap:wrap;margin-top:5px;">
      <span>TOTAL COMMANDE:</span><span style="word-break:break-all;">${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
    </div>
    <p style="margin:6px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="font-weight:bold;margin:4px 0 2px 0;font-size:9pt;">HISTORIQUE DES VERSEMENTS (${payments.length}/3) :</div>
    ${paymentsRows || '<div style="font-style:italic;font-size:8.5pt;">Aucun versement enregistré</div>'}
    <p style="margin:4px 0;border-bottom:1.5px dashed #000;"></p>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:8.5pt;">
      <span>TOTAL PAYÉ:</span><span style="word-break:break-all;">${Math.round(totalPaid).toLocaleString('fr-FR')} FCFA</span>
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:9pt;margin-top:2px;font-weight:bold;">
      <span>SOLDE RESTANT:</span><span>0 FCFA</span>
    </div>
    ${lastPayment ? `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;font-weight:900;font-size:13pt;margin:8px 0 4px 0;border:2px solid #000;padding:6px;background:#f9f9f9;">
      <span>MONTANT PAYÉ CE JOUR:</span>
      <span style="word-break:break-all;font-size:13pt;">${Math.round(lastPaymentAmount).toLocaleString('fr-FR')} FCFA</span>
    </div>` : ''}
    <p style="text-align:center;margin-top:10px;font-size:9pt;font-weight:bold;border:1.5px solid #000;padding:4px;">
      RÉSERVATION ENTIÈREMENT SOLDÉE<br>Merci de votre confiance !
    </p>
    <p style="text-align:center;margin-top:10px;font-size:8.5pt;font-weight:bold;border-top:1px dashed #000;padding-top:6px;margin-bottom:4px;">
      Un article vendu n'est ni remboursable ni changeable
    </p>
    <p style="text-align:center;margin-top:6px;font-size:9pt;font-weight:bold;">Merci de votre visite !</p>
    <div style="text-align:center;margin-top:8px;font-size:7.5pt;color:#000;font-weight:bold;">Fait par © TriSpark Digital1</div>
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Facture POS</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; }
          html, body {
            width: 70mm;
            margin: 0 auto;
            padding: 0;
            font-family: 'Consolas', 'Lucida Console', 'Courier New', monospace;
            font-size: 8.5pt;
            letter-spacing: -0.2px;
            line-height: 1.2;
            color: #000;
            background: #fff;
            word-break: break-word;
            overflow-wrap: break-word;
            -webkit-print-color-adjust: exact;
          }
        </style>
      </head>
      <body>${printHTML}</body>
    </html>`;

  dispatchPrint(fullHtml, { invoiceData }, 'reservation-invoice', invoiceData.id);
  setTimeout(() => { isPrintingBusy = false; }, 2000);
};

/**
 * Formate une date ISO en "Lun. 28 Oct. a 14:30"
 */
export const formatScheduledAt = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
};