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

// ─── Shared Beauty Receipt Templates ─────────────────────────────────────────
export const getBeautyReceiptStyles = () => `
  @page { margin: 0; size: auto; }
  * { box-sizing: border-box; }
  html, body {
    width: 72mm;
    margin: 0 auto;
    padding: 3mm 2mm;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 8.5pt;
    line-height: 1.25;
    color: #1a120c;
    background: #fff;
    word-break: break-word;
    overflow-wrap: break-word;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;

export const renderBeautyHeader = (title, subtitle = 'SALON DE BEAUTÉ & SOINS') => `
  <div style="text-align:center;margin-bottom:6px;">
    <div style="font-size:7.5pt;letter-spacing:3px;color:#b38059;font-weight:700;margin-bottom:1px;">✦ &nbsp; • &nbsp; ✧ &nbsp; • &nbsp; ✦</div>
    <h1 style="margin:0;font-size:14pt;font-weight:900;letter-spacing:2px;color:#1a120c;text-transform:uppercase;line-height:1.15;">DIMITRI PERFECT</h1>
    <div style="font-size:7.5pt;font-weight:700;letter-spacing:1.5px;color:#7c6858;text-transform:uppercase;margin:2px 0 1px 0;">${subtitle}</div>
    <div style="font-size:7pt;color:#8a786a;font-weight:500;">NIU : P079216781512Z</div>
    <div style="margin:5px auto 3px auto;display:inline-block;padding:2px 10px;border:1.2px solid #2c1e14;border-radius:12px;font-size:7.5pt;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;background:#faf7f4;color:#1a120c;">
      ${title}
    </div>
  </div>
`;

export const renderBeautyItemsList = (items = []) => {
  const map = {};
  items.forEach(item => {
    const key = `${item.categoryName}||${item.price}`;
    if (!map[key]) map[key] = { categoryName: item.categoryName, price: item.price, qty: 0 };
    map[key].qty += (item.qty || 1);
  });
  const grouped = Object.values(map);

  return `
    <div style="margin:6px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #2c1e14;padding-bottom:3px;margin-bottom:4px;font-size:7.5pt;font-weight:800;letter-spacing:0.8px;color:#2c1e14;text-transform:uppercase;">
        <span>PRESTATIONS &amp; ARTICLES</span>
        <span>TOTAL</span>
      </div>
      ${grouped.map(item => `
        <div style="border-bottom:1px dashed #e2dbd4;padding:4px 0;page-break-inside:avoid;">
          <div style="font-size:8.5pt;font-weight:600;color:#1a120c;line-height:1.25;word-break:break-word;overflow-wrap:break-word;">
            ${item.categoryName}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;font-size:8pt;color:#666;">
            <span style="letter-spacing:0.2px;">
              ${item.qty} × ${Math.round(item.price).toLocaleString('fr-FR')} FCFA
            </span>
            <span style="font-weight:700;color:#000;font-size:8.5pt;">
              ${Math.round(item.price * item.qty).toLocaleString('fr-FR')} FCFA
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

export const renderBeautyFooter = (extraNote = '') => `
  <div style="text-align:center;margin-top:8px;padding-top:6px;border-top:1px dashed #d5cdc5;page-break-inside:avoid;">
    ${extraNote ? `<div style="font-size:7.5pt;font-weight:600;color:#5a4232;margin-bottom:4px;line-height:1.3;">${extraNote}</div>` : ''}
    <div style="font-size:8pt;font-weight:700;color:#1a120c;margin-bottom:2px;">✦ Merci de votre visite &amp; à très bientôt ! ✦</div>
    <div style="font-size:7.5pt;color:#7c6858;font-style:italic;margin-bottom:3px;">Révélez votre beauté chez Dimitri Perfect ✨</div>
    <div style="font-size:6.8pt;color:#8a786a;margin-bottom:4px;line-height:1.25;">Les prestations et articles vendus ne sont ni remboursables ni échangeables.</div>
    <div style="font-size:6.5pt;color:#999;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Dimitri Perfect POS • Par TriSpark Digital</div>
  </div>
`;

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
      return `<div style="display:flex;justify-content:space-between;padding:1px 0;font-size:8pt;color:#333;">
        <span>• ${label} :</span>
        <span style="font-weight:700;color:#000;">${new Intl.NumberFormat('fr-FR').format(v)} FCFA</span>
      </div>`;
    });
    return `<div style="margin:4px 0;padding:4px 0;border-top:1px dashed #d5cdc5;border-bottom:1px dashed #d5cdc5;">
      <div style="font-size:7.5pt;font-weight:800;letter-spacing:0.5px;color:#5a4232;margin-bottom:2px;text-transform:uppercase;">Règlement Mixte :</div>
      ${lines.join('')}
    </div>`;
  }

  // Single method
  let label = 'Non précisé';
  if (methodStr === 'CASH') label = 'Espèces';
  else if (methodStr === 'ONLINE') label = 'Mobile Money';
  else if (methodStr === 'ORANGE_MONEY') label = 'Orange Money';
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;font-size:8pt;">
    <span style="color:#666;">Règlement :</span>
    <span style="font-weight:700;color:#1a120c;background:#f3ece4;padding:1px 6px;border-radius:4px;">${label}</span>
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
    ${renderBeautyHeader('RAPPORT DE CLÔTURE (Z)', 'SYNTHÈSE DE CAISSE')}
    <div style="background:#fbf9f6;border:1px solid #ebe5df;border-radius:6px;padding:6px 8px;margin:5px 0;font-size:8pt;line-height:1.4;">
      <div style="display:flex;justify-content:space-between;margin:2px 0;">
        <span style="color:#666;">Date &amp; Heure :</span>
        <span style="font-weight:600;color:#1a120c;">${invoiceData.zReport.date} ${invoiceData.zReport.time}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:2px 0;">
        <span style="color:#666;">Opérateur :</span>
        <span style="font-weight:600;color:#1a120c;">${invoiceData.zReport.cashierName || invoiceData.createdBy?.name || 'Admin'}</span>
      </div>
    </div>

    <div style="border:1.5px solid #2c1e14;border-radius:6px;padding:6px 8px;margin:6px 0;background:#fff;">
      <div style="font-size:7.5pt;font-weight:800;letter-spacing:1px;color:#7c6858;text-transform:uppercase;margin-bottom:4px;">SYNTHÈSE COMPTABLE</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11pt;font-weight:800;color:#1a120c;margin:4px 0;">
        <span>TOTAL NET :</span>
        <span style="font-size:12pt;">${Math.round(invoiceData.zReport.totalSales).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;margin:2px 0;color:#444;">
        <span>Espèces :</span>
        <span style="font-weight:700;">${Math.round(invoiceData.zReport.totalCash || invoiceData.zReport.payments?.CASH || 0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;margin:2px 0;color:#444;">
        <span>Mobile Money :</span>
        <span style="font-weight:700;">${Math.round(invoiceData.zReport.totalOnline || invoiceData.zReport.payments?.ONLINE || 0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;margin:2px 0;color:#444;">
        <span>Orange Money :</span>
        <span style="font-weight:700;">${Math.round(invoiceData.zReport.payments?.ORANGE_MONEY || 0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;margin:2px 0;color:#444;">
        <span>Ventes Validées :</span>
        <span style="font-weight:700;">${invoiceData.zReport.validatedCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;margin:2px 0;color:#444;">
        <span>Ventes Annulées :</span>
        <span style="font-weight:700;color:#c93b3b;">${invoiceData.zReport.cancelledCount}</span>
      </div>
    </div>

    ${(invoiceData.zReport.topSelling && invoiceData.zReport.topSelling.length > 0) ? `
      <div style="margin:6px 0;">
        <div style="border-bottom:1.5px solid #2c1e14;padding-bottom:3px;margin-bottom:4px;font-size:7.5pt;font-weight:800;letter-spacing:0.8px;color:#2c1e14;text-transform:uppercase;">
          RÉPARTITION PAR CATÉGORIE
        </div>
        ${invoiceData.zReport.topSelling.map(cat => `
          <div style="display:flex;justify-content:space-between;font-size:8pt;border-bottom:1px dashed #e2dbd4;padding:3px 0;">
            <span style="color:#1a120c;">${cat.name} (x${cat.quantity})</span>
            <span style="font-weight:700;color:#000;">${Math.round(cat.revenue).toLocaleString('fr-FR')} FCFA</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="text-align:center;margin-top:10px;font-size:7.5pt;font-weight:800;color:#7c6858;letter-spacing:1px;border-top:1px dashed #d5cdc5;padding-top:6px;">
      --- FIN DU RAPPORT DE CLÔTURE Z ---
    </div>
  ` : `
    ${renderBeautyHeader(isDelivery ? 'BON DE LIVRAISON' : (isReservation ? 'FACTURE DE RÉSERVATION' : 'TICKET DE CAISSE'))}
    <div style="background:#fbf9f6;border:1px solid #ebe5df;border-radius:6px;padding:6px 8px;margin:5px 0;font-size:8pt;line-height:1.4;">
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">N° ${isDelivery ? 'Livraison' : (isReservation ? 'Facture' : 'Ticket')} :</span>
        <span style="font-weight:800;color:#1a120c;font-family:monospace;">${isDelivery && invoiceData.deliveryNo ? invoiceData.deliveryNo : invoiceData.invoiceNumber}</span>
      </div>
      ${isDelivery ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Statut :</span>
        <span style="font-weight:700;color:#1a120c;border:1px solid #1a120c;padding:0 4px;border-radius:3px;font-size:7.5pt;">${deliveryStatusLabel}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Date :</span>
        <span style="color:#1a120c;font-weight:600;">${new Date(invoiceData.createdAt).toLocaleString('fr-FR')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Caissière :</span>
        <span style="color:#1a120c;font-weight:600;">${invoiceData.createdBy?.name || 'Caissière'}</span>
      </div>
      ${hasName ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Client :</span>
        <span style="font-weight:700;color:#1a120c;text-align:right;">${clientNameStr}</span>
      </div>` : ''}
      ${hasPhone ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Téléphone :</span>
        <span style="font-weight:700;color:#1a120c;text-align:right;">${clientPhoneStr}</span>
      </div>` : ''}
      ${isDelivery && invoiceData.deliveryAddress ? `
      <div style="margin-top:3px;padding-top:3px;border-top:1px dashed #d5cdc5;">
        <span style="color:#666;font-size:7.5pt;">Adresse livraison :</span>
        <div style="font-weight:700;color:#1a120c;">${invoiceData.deliveryAddress}</div>
      </div>` : ''}
      ${isDelivery && invoiceData.deliveryPerson ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Livreur :</span>
        <span style="font-weight:700;color:#1a120c;">${invoiceData.deliveryPerson}</span>
      </div>` : ''}
      ${renderPaymentMethodHTML(invoiceData.paymentMethod)}
    </div>

    ${renderBeautyItemsList(invoiceData.items || [])}

    <div style="border:1.5px solid #2c1e14;border-radius:6px;padding:6px 8px;margin-top:6px;background:#fff;">
      ${(isDelivery && Number(invoiceData.deliveryFee || 0) > 0) ? `
        <div style="display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:2px;color:#666;">
          <span>Sous-total prestations/articles :</span>
          <span>${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:3px;color:#666;">
          <span>Frais de livraison :</span>
          <span>${Math.round(invoiceData.deliveryFee).toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div style="border-top:1px dashed #d5cdc5;margin:3px 0;"></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:10.5pt;font-weight:800;color:#1a120c;">
          <span>TOTAL À PAYER :</span>
          <span style="font-size:12pt;">${Math.round(Number(invoiceData.totalAmount) + Number(invoiceData.deliveryFee)).toLocaleString('fr-FR')} FCFA</span>
        </div>
      ` : `
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:10.5pt;font-weight:800;color:#1a120c;">
          <span>TOTAL À PAYER :</span>
          <span style="font-size:12pt;">${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
        </div>
      `}
    </div>

    ${renderBeautyFooter()}
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket Dimitri Perfect</title>
        <style>${getBeautyReceiptStyles()}</style>
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
      <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:8pt;${isLast ? 'font-weight:700;color:#1a120c;' : 'color:#555;'}">
        <span>Tranche ${p.installmentNumber || idx + 1}/3 (${getPaymentMethodLabel(p.paymentMethod)})${isLast ? ' [Ce jour]' : ''} :</span>
        <span style="font-weight:700;">${Math.round(p.amount).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `;
  }).join('');

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, (Number(reservation.totalAmount) || 0) - totalPaid);

  const printHTML = `
    ${renderBeautyHeader('REÇU PROFORMA (RÉSERVATION)')}
    <div style="background:#fbf9f6;border:1px solid #ebe5df;border-radius:6px;padding:6px 8px;margin:5px 0;font-size:8pt;line-height:1.4;">
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">N° Réservation :</span>
        <span style="font-weight:800;color:#1a120c;font-family:monospace;">${reservation.reservationNo}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Date :</span>
        <span style="color:#1a120c;font-weight:600;">${new Date(reservation.createdAt).toLocaleString('fr-FR')}</span>
      </div>
      ${reservation.clientName ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Client :</span>
        <span style="font-weight:700;color:#1a120c;text-align:right;">${reservation.clientName}</span>
      </div>` : ''}
      ${reservation.clientPhone ? `
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Téléphone :</span>
        <span style="font-weight:700;color:#1a120c;text-align:right;">${reservation.clientPhone}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Enregistré par :</span>
        <span style="color:#1a120c;font-weight:600;">${reservation.createdBy?.name || 'Caissière'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Statut :</span>
        <span style="font-weight:700;color:#1a120c;">${reservation.status === 'COMPLETED' ? 'PAYÉE À 100%' : 'EN COURS DE PAIEMENT'}</span>
      </div>
    </div>

    ${renderBeautyItemsList(reservation.items || [])}

    <div style="border:1.5px solid #2c1e14;border-radius:6px;padding:6px 8px;margin-top:6px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:10pt;font-weight:800;color:#1a120c;">
        <span>MONTANT TOTAL :</span>
        <span style="font-size:11.5pt;">${Math.round(reservation.totalAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="font-size:7.5pt;font-weight:800;color:#7c6858;letter-spacing:0.8px;text-transform:uppercase;margin:3px 0 2px 0;">
        HISTORIQUE DES VERSEMENTS (${reservation.payments?.length || 0}/3)
      </div>
      ${paymentsList || '<div style="font-style:italic;font-size:7.5pt;color:#888;">Aucun versement effectué</div>'}
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;color:#666;">
        <span>Total déjà payé :</span>
        <span style="font-weight:700;color:#1a120c;">${Math.round(totalPaid).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8.5pt;font-weight:800;color:#1a120c;margin-top:2px;">
        <span>RESTE À PAYER :</span>
        <span>${Math.round(remaining).toLocaleString('fr-FR')} FCFA</span>
      </div>
      ${lastPayment ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;padding:4px 6px;background:#fbf9f6;border:1px solid #2c1e14;border-radius:4px;font-weight:800;font-size:9pt;color:#1a120c;">
        <span>MONTANT PAYÉ CE JOUR :</span>
        <span style="font-size:10.5pt;">${Math.round(lastPaymentAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>` : ''}
    </div>

    ${renderBeautyFooter('Document Proforma de Réservation.<br>La facture définitive est remise après solde complet.')}
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Réservation Dimitri Perfect</title>
        <style>${getBeautyReceiptStyles()}</style>
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

  const isFullyPaid = totalPaid >= (Number(invoiceData.totalAmount) || 0) - 0.01;
  const paymentsRows = payments.map((p, idx) => {
    const isLast = idx === payments.length - 1;
    const paymentLabel = isFullyPaid && isLast
      ? `Paiement final — Solde complet (${getPaymentMethodLabel(p.paymentMethod)})`
      : `Tranche ${p.installmentNumber || idx + 1}/3 (${getPaymentMethodLabel(p.paymentMethod)})${isLast ? ' [Ce jour]' : ''}`;
    return `
      <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:8pt;${isLast ? 'font-weight:700;color:#1a120c;' : 'color:#555;'}">
        <span>${paymentLabel} :</span>
        <span style="font-weight:700;">${Math.round(p.amount).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `;
  }).join('');

  const printHTML = `
    ${renderBeautyHeader('FACTURE DÉFINITIVE')}
    <div style="background:#f3ece4;color:#4a3222;padding:3px 6px;border-radius:4px;margin-bottom:5px;text-align:center;font-size:7.5pt;font-weight:700;letter-spacing:0.5px;">
      SOLDE FINAL — Réservation N° ${invoiceData.sourceReservationNo || ''}
    </div>
    <div style="background:#fbf9f6;border:1px solid #ebe5df;border-radius:6px;padding:6px 8px;margin:5px 0;font-size:8pt;line-height:1.4;">
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">N° Facture :</span>
        <span style="font-weight:800;color:#1a120c;font-family:monospace;">${invoiceData.invoiceNumber}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Date :</span>
        <span style="color:#1a120c;font-weight:600;">${new Date(invoiceData.createdAt).toLocaleString('fr-FR')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:1px 0;">
        <span style="color:#666;">Caissière :</span>
        <span style="color:#1a120c;font-weight:600;">${invoiceData.createdBy?.name || 'Caissière'}</span>
      </div>
      ${invoiceData.clientName ? `<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#666;">Client :</span><span style="font-weight:700;color:#1a120c;">${invoiceData.clientName}</span></div>` : ''}
      ${invoiceData.clientPhone ? `<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#666;">Tél :</span><span style="font-weight:600;color:#1a120c;">${invoiceData.clientPhone}</span></div>` : ''}
    </div>

    ${renderBeautyItemsList(invoiceData.items || [])}

    <div style="border:1.5px solid #2c1e14;border-radius:6px;padding:6px 8px;margin-top:6px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:10pt;font-weight:800;color:#1a120c;">
        <span>TOTAL COMMANDE :</span>
        <span style="font-size:11.5pt;">${Math.round(invoiceData.totalAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="font-size:7.5pt;font-weight:800;color:#7c6858;letter-spacing:0.8px;text-transform:uppercase;margin:3px 0 2px 0;">
        HISTORIQUE DES VERSEMENTS (${payments.length}/3)
      </div>
      ${paymentsRows || '<div style="font-style:italic;font-size:7.5pt;color:#888;">Aucun versement enregistré</div>'}
      <div style="border-top:1px dashed #d5cdc5;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-size:8pt;color:#666;">
        <span>Total payé :</span>
        <span style="font-weight:700;color:#1a120c;">${Math.round(totalPaid).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8.5pt;font-weight:800;color:#1a120c;margin-top:2px;">
        <span>SOLDE RESTANT :</span>
        <span style="color:#2d8a55;">0 FCFA</span>
      </div>
      ${lastPayment ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;padding:4px 6px;background:#fbf9f6;border:1px solid #2c1e14;border-radius:4px;font-weight:800;font-size:9pt;color:#1a120c;">
        <span>MONTANT PAYÉ CE JOUR :</span>
        <span style="font-size:10.5pt;">${Math.round(lastPaymentAmount).toLocaleString('fr-FR')} FCFA</span>
      </div>` : ''}
    </div>

    <div style="text-align:center;margin-top:6px;font-size:8pt;font-weight:700;border:1.2px solid #2c1e14;border-radius:4px;padding:4px;background:#faf7f4;color:#1a120c;">
      RÉSERVATION ENTIÈREMENT SOLDÉE<br>Merci de votre confiance !
    </div>

    ${renderBeautyFooter()}
  `;

  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Facture Dimitri Perfect</title>
        <style>${getBeautyReceiptStyles()}</style>
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