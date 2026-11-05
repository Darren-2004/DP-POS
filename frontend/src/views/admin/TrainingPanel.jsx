import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Check, Clock3, FilePlus2, Pencil, Printer, RefreshCw, Search, Users, X } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/DesignSystem';
import { apiFetch, formatFCFA, getTodayDateStr, getPaymentMethodLabel, showToast, triggerPrint } from '../../utils/helpers';
import { API_BASE } from '../../utils/constants';
import { useShopNames } from '../../components/ShopNamesContext';

const emptyCourse = { name: '', description: '', price: '', duration: '' };
const emptyEnrollment = {
  studentName: '',
  studentPhone: '',
  studentEmail: '',
  courseId: '',
  initialAmount: '',
  paymentMethod: 'CASH',
  nextDueDate: '',
  shopType: 'FEMME',
};

const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function requestJson(path, options) {
  const response = await apiFetch(`${API_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || 'La demande a échoué.');
  return data;
}

function paymentReceipt(enrollment, payment, shopNames) {
  return {
    id: payment.id,
    isTrainingPayment: true,
    paymentNumber: payment.paymentNumber,
    installmentNumber: payment.installmentNumber,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    createdAt: payment.createdAt,
    createdBy: { name: payment.createdByName || enrollment.registeredBy },
    studentName: enrollment.studentName,
    studentPhone: enrollment.studentPhone,
    courseName: enrollment.courseName,
    coursePrice: enrollment.coursePrice,
    shopType: enrollment.shopType,
    shopName: enrollment.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME,
    totalPaidAfter: payment.totalPaidAfter,
    remainingAfter: payment.remainingAfter,
  };
}

function trancheLabel(number) {
  if (number === 1) return '1re';
  return `${number}e`;
}

function auditDescription(entry) {
  const details = entry.details || {};
  const student = entry.studentName || details.studentName || 'apprenant';
  const course = entry.courseName || details.courseName || 'formation';
  const actor = entry.actorName || 'Utilisateur';
  if (entry.action === 'PAYMENT_RECORDED') {
    const installment = Number(entry.installmentNumber || details.installmentNumber);
    return `Paiement de la ${trancheLabel(installment)} tranche de ${student} pour la formation ${course} — ${formatFCFA(details.amount)}; enregistré par ${actor}.`;
  }
  if (entry.action === 'PAYMENT_VOIDED') {
    return `Régularisation du paiement ${details.paymentNumber || entry.paymentNumber || ''} de ${student} pour la formation ${course} — ${formatFCFA(details.amount)}; motif : ${details.reason || 'non précisé'}; effectuée par ${actor}.`;
  }
  if (entry.action === 'ENROLLMENT_CREATED') {
    return `Inscription de ${student} à la formation ${course} — enregistrée par ${actor}.`;
  }
  if (entry.action === 'DUE_DATE_UPDATED') {
    return `Échéance de ${student} pour la formation ${course} mise à jour par ${actor} : ${details.nextDueDate || 'supprimée'}.`;
  }
  if (entry.action.startsWith('COURSE_')) {
    return `${entry.action === 'COURSE_CREATED' ? 'Création' : 'Modification'} de la formation ${details.name || course} par ${actor}.`;
  }
  return `${entry.action.replaceAll('_', ' ')} — ${student}, ${course}; par ${actor}.`;
}

function Metric({ label, value, note, tone = 'amber' }) {
  const colors = {
    amber: 'border-amber-200 bg-amber-50/70 text-amber-900',
    green: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    blue: 'border-blue-200 bg-blue-50/70 text-blue-900',
    rose: 'border-rose-200 bg-rose-50/70 text-rose-900',
    neutral: 'border-neutral-200 bg-neutral-50 text-neutral-800',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-[11px] opacity-75">{note}</div>}
    </div>
  );
}

export default function TrainingPanel({ currentUser, shopType = null }) {
  const { shopNames } = useShopNames();
  const isAdmin = currentUser?.role === 'ADMIN';
  const today = getTodayDateStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [scope, setScope] = useState(shopType || '');
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourse, setEditingCourse] = useState(null);
  const [enrollmentForm, setEnrollmentForm] = useState({
    ...emptyEnrollment,
    shopType: shopType || 'FEMME',
  });
  const [savingCourse, setSavingCourse] = useState(false);
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [payingEnrollment, setPayingEnrollment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'CASH' });
  const [paymentRequestKey, setPaymentRequestKey] = useState('');
  const enrollmentRequestKey = useRef(requestId());
  const [expandedEnrollment, setExpandedEnrollment] = useState('');
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    if (scope) params.set('shopType', scope);
    return params.toString();
  }, [startDate, endDate, scope]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams(query);
      const coursesPath = `/training/courses${isAdmin ? '?includeInactive=1' : ''}`;
      const [courseData, enrollmentData, summaryData] = await Promise.all([
        requestJson(coursesPath),
        requestJson(`/training/enrollments?${params.toString()}`),
        requestJson(`/training/summary?${query}`),
      ]);
      setCourses(Array.isArray(courseData) ? courseData : []);
      setEnrollments(Array.isArray(enrollmentData) ? enrollmentData : []);
      setSummary(summaryData);
    } catch (error) {
      console.error('Training data loading failed:', error);
      setLoadError(error.message || 'Impossible de charger le suivi des formations.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeCourses = courses.filter((course) => course.isActive);
  const visibleEnrollments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return enrollments;
    return enrollments.filter((enrollment) =>
      [enrollment.studentName, enrollment.studentPhone, enrollment.courseName]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term))
    );
  }, [enrollments, search]);

  const handleCourseSubmit = async (event) => {
    event.preventDefault();
    setSavingCourse(true);
    try {
      const editing = Boolean(editingCourse);
      await requestJson(
        editing ? `/training/courses/${editingCourse.id}` : '/training/courses',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...courseForm, price: Number(courseForm.price) }),
        },
      );
      setCourseForm(emptyCourse);
      setEditingCourse(null);
      showToast(editing ? 'Formation mise à jour.' : 'Formation ajoutée au catalogue.', 'success');
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer la formation.', 'error');
    } finally {
      setSavingCourse(false);
    }
  };

  const startCourseEdit = (course) => {
    setEditingCourse(course);
    setCourseForm({
      name: course.name,
      description: course.description || '',
      price: String(course.price),
      duration: course.duration || '',
    });
  };

  const toggleCourse = async (course) => {
    try {
      await requestJson(`/training/courses/${course.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !course.isActive }),
      });
      showToast(course.isActive ? 'Formation désactivée; les inscriptions existantes sont conservées.' : 'Formation réactivée.', 'success');
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible de modifier la formation.', 'error');
    }
  };

  const handleEnrollmentSubmit = async (event) => {
    event.preventDefault();
    setSavingEnrollment(true);
    try {
      const result = await requestJson('/training/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enrollmentForm,
          initialAmount: Number(enrollmentForm.initialAmount || 0),
          shopType: isAdmin ? enrollmentForm.shopType : shopType,
          requestKey: enrollmentRequestKey.current,
        }),
      });
      const initialPayment = result.payments?.find((payment) => payment.status === 'VALIDATED');
      if (initialPayment) triggerPrint(paymentReceipt(result, initialPayment, shopNames));
      enrollmentRequestKey.current = requestId();
      setEnrollmentForm({ ...emptyEnrollment, shopType: shopType || 'FEMME' });
      showToast('Apprenant inscrit à la formation.', 'success');
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible d’inscrire cet apprenant.', 'error');
    } finally {
      setSavingEnrollment(false);
    }
  };

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();
    if (!payingEnrollment) return;
    try {
      const result = await requestJson(`/training/enrollments/${payingEnrollment.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          amount: Number(paymentForm.amount),
          requestKey: paymentRequestKey,
        }),
      });
      if (result.recordedPayment) {
        triggerPrint(paymentReceipt(result, result.recordedPayment, shopNames));
      }
      setPayingEnrollment(null);
      setPaymentForm({ amount: '', paymentMethod: 'CASH' });
      showToast(result.duplicateRequest ? 'Paiement déjà enregistré; reçu disponible.' : 'Paiement enregistré; impression du reçu lancée.', 'success');
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer le paiement.', 'error');
    }
  };

  const handleVoid = async (event) => {
    event.preventDefault();
    if (!voidTarget || !voidReason.trim()) return;
    try {
      await requestJson(`/training/payments/${voidTarget.payment.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidTarget(null);
      setVoidReason('');
      showToast('Paiement régularisé; l’historique a été conservé.', 'success');
      window.dispatchEvent(new CustomEvent('pos:dashboard-refresh'));
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible de régulariser ce paiement.', 'error');
    }
  };

  const saveDueDate = async (enrollment) => {
    try {
      await requestJson(`/training/enrollments/${enrollment.id}/due-date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextDueDate: dueDateDraft[enrollment.id] || null }),
      });
      showToast('Prochaine échéance mise à jour.', 'success');
      await loadData();
    } catch (error) {
      showToast(error.message || 'Impossible de mettre à jour l’échéance.', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-xl border border-[#e8dcd2] bg-[#faf6f2] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#b38059] p-2 text-white"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-extrabold text-neutral-900">Formations & apprenants</h1>
            <p className="mt-1 text-xs text-neutral-600">Catalogue, encaissements par tranches, soldes à percevoir et historique auditable.</p>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[11px] font-semibold text-neutral-600">
            Du
            <input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs" />
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-neutral-600">
            Au
            <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs" />
          </label>
          {isAdmin && (
            <label className="grid gap-1 text-[11px] font-semibold text-neutral-600">
              Shop
              <select value={scope} onChange={(event) => setScope(event.target.value)} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs">
                <option value="">Tous les shops</option>
                <option value="HOMME">{shopNames.HOMME}</option>
                <option value="FEMME">{shopNames.FEMME}</option>
              </select>
            </label>
          )}
          <label className="grid gap-1 text-[11px] font-semibold text-neutral-600">
            Rechercher
            <span className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-neutral-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Apprenant ou formation" className="w-44 text-xs outline-none" />
            </span>
          </label>
        </div>
        <button type="button" onClick={loadData} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-100 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </section>

      {loadError && <ErrorState title="Données de formation indisponibles" description={loadError} onRetry={loadData} />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Formations actives" value={summary?.courseCount || 0} tone="blue" />
        <Metric label="Apprenants inscrits" value={summary?.learnerCount || 0} note={`${summary?.enrollmentCount || 0} inscription(s) active(s)`} tone="neutral" />
        <Metric label="Encaissé sur la période" value={formatFCFA(summary?.periodRevenue || 0)} tone="green" />
        <Metric label="Reste à percevoir" value={formatFCFA(summary?.remainingBalance || 0)} note={`Montant attendu: ${formatFCFA(summary?.expectedRevenue || 0)}`} tone="amber" />
        <Metric label="Échéances dépassées" value={summary?.overdueCount || 0} tone={summary?.overdueCount ? 'rose' : 'neutral'} />
      </section>

      {loading && !summary ? <LoadingState label="Chargement du suivi des formations..." rows={3} /> : (
        <div className="grid gap-5 xl:grid-cols-2">
          {isAdmin && (
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-bold text-neutral-900">{editingCourse ? 'Modifier une formation' : 'Catalogue des formations'}</h2>
              <form onSubmit={handleCourseSubmit} className="grid gap-2 sm:grid-cols-2">
                <input required value={courseForm.name} onChange={(event) => setCourseForm({ ...courseForm, name: event.target.value })} placeholder="Nom de la formation" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
                <input required min="1" type="number" step="1" value={courseForm.price} onChange={(event) => setCourseForm({ ...courseForm, price: event.target.value })} placeholder="Tarif total (FCFA)" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
                <input value={courseForm.duration} onChange={(event) => setCourseForm({ ...courseForm, duration: event.target.value })} placeholder="Durée (ex. 3 mois)" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
                <input value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} placeholder="Description" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
                <div className="flex gap-2 sm:col-span-2">
                  <button disabled={savingCourse} className="inline-flex items-center gap-2 rounded-lg bg-[#b38059] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {editingCourse ? <Check className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                    {savingCourse ? 'Enregistrement...' : editingCourse ? 'Enregistrer la modification' : 'Ajouter la formation'}
                  </button>
                  {editingCourse && <button type="button" onClick={() => { setEditingCourse(null); setCourseForm(emptyCourse); }} className="rounded-lg border px-3 py-2 text-xs font-semibold">Annuler</button>}
                </div>
              </form>
              <div className="mt-4 divide-y divide-neutral-100">
                {courses.map((course) => (
                  <div key={course.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-neutral-900">{course.name}</div>
                      <div className="text-[11px] text-neutral-500">{formatFCFA(course.price)}{course.duration ? ` · ${course.duration}` : ''} · {course.isActive ? 'Active' : 'Inactive'}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" title="Modifier" onClick={() => startCourseEdit(course)} className="rounded p-2 text-neutral-500 hover:bg-neutral-100"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => toggleCourse(course)} className="rounded border border-neutral-200 px-2 py-1.5 text-[10px] font-semibold hover:bg-neutral-50">{course.isActive ? 'Désactiver' : 'Réactiver'}</button>
                    </div>
                  </div>
                ))}
                {!courses.length && <p className="py-3 text-xs text-neutral-500">Aucune formation dans le catalogue.</p>}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold text-neutral-900">Inscrire un apprenant</h2>
            <form onSubmit={handleEnrollmentSubmit} className="grid gap-2 sm:grid-cols-2">
              <input required value={enrollmentForm.studentName} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, studentName: event.target.value })} placeholder="Nom complet" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
              <input value={enrollmentForm.studentPhone} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, studentPhone: event.target.value })} placeholder="Téléphone" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
              <input type="email" value={enrollmentForm.studentEmail} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, studentEmail: event.target.value })} placeholder="Courriel (facultatif)" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
              <select required value={enrollmentForm.courseId} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, courseId: event.target.value })} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs">
                <option value="">Choisir une formation</option>
                {activeCourses.map((course) => <option key={course.id} value={course.id}>{course.name} — {formatFCFA(course.price)}</option>)}
              </select>
              {isAdmin && (
                <select value={enrollmentForm.shopType} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, shopType: event.target.value })} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs">
                  <option value="HOMME">{shopNames.HOMME}</option>
                  <option value="FEMME">{shopNames.FEMME}</option>
                </select>
              )}
              <input min="0" type="number" step="1" value={enrollmentForm.initialAmount} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, initialAmount: event.target.value })} placeholder="Première tranche (FCFA)" className="rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
              <select value={enrollmentForm.paymentMethod} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, paymentMethod: event.target.value })} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs">
                <option value="CASH">Espèces</option><option value="ONLINE">Mobile Money / Wave</option><option value="ORANGE_MONEY">Orange Money</option>
              </select>
              <label className="grid gap-1 text-[10px] font-semibold text-neutral-500">Prochaine échéance (facultatif)
                <input type="date" value={enrollmentForm.nextDueDate} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, nextDueDate: event.target.value })} className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-normal text-neutral-900" />
              </label>
              <button disabled={savingEnrollment || !activeCourses.length} className="self-end rounded-lg bg-[#b38059] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {savingEnrollment ? 'Inscription...' : 'Inscrire l’apprenant'}
              </button>
              {!isAdmin && <div className="sm:col-span-2 text-[10px] text-neutral-500">L’apprenant sera automatiquement rattaché à votre shop.</div>}
            </form>
          </section>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Apprenants & historique des paiements</h2>
            <p className="text-[11px] text-neutral-500">Les tarifs sont figés à l’inscription; les paiements validés ne peuvent pas dépasser le solde.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-neutral-600">{visibleEnrollments.length} dossier(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-white text-[10px] uppercase tracking-wider text-neutral-500">
              <tr><th className="px-4 py-3">Apprenant / formation</th><th className="px-4 py-3">Shop</th><th className="px-4 py-3 text-right">Tarif</th><th className="px-4 py-3 text-right">Payé</th><th className="px-4 py-3 text-right">Solde</th><th className="px-4 py-3">Échéance</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleEnrollments.map((enrollment) => {
                const overdue = enrollment.nextDueDate && enrollment.nextDueDate < today && enrollment.remaining > 0;
                const expanded = expandedEnrollment === enrollment.id;
                return (
                  <React.Fragment key={enrollment.id}>
                    <tr className={overdue ? 'bg-rose-50/50' : 'hover:bg-neutral-50'}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedEnrollment(expanded ? '' : enrollment.id)} className="text-left">
                          <div className="font-bold text-neutral-900">{enrollment.studentName}</div>
                          <div className="text-[10px] text-neutral-500">{enrollment.courseName}{enrollment.studentPhone ? ` · ${enrollment.studentPhone}` : ''}</div>
                          <div className="text-[10px] text-[#9c6a41]">{enrollment.payments.length} tranche(s) · Inscrit par {enrollment.registeredBy}</div>
                        </button>
                      </td>
                      <td className="px-4 py-3">{enrollment.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatFCFA(enrollment.coursePrice)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatFCFA(enrollment.totalPaid)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{formatFCFA(enrollment.remaining)}</td>
                      <td className="px-4 py-3">
                        <div className={`mb-1 flex items-center gap-1 ${overdue ? 'font-bold text-rose-700' : 'text-neutral-600'}`}>
                          {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                          {overdue ? 'En retard' : enrollment.nextDueDate || 'Non définie'}
                        </div>
                        <div className="flex gap-1">
                          <input type="date" value={dueDateDraft[enrollment.id] ?? enrollment.nextDueDate ?? ''} onChange={(event) => setDueDateDraft({ ...dueDateDraft, [enrollment.id]: event.target.value })} className="w-32 rounded border border-neutral-200 px-1 py-1 text-[10px]" />
                          <button type="button" title="Enregistrer l’échéance" onClick={() => saveDueDate(enrollment)} className="rounded border border-neutral-200 p-1 hover:bg-neutral-100"><Check className="h-3 w-3" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" disabled={!enrollment.remaining || enrollment.status !== 'ACTIVE'} onClick={() => { setPayingEnrollment(enrollment); setPaymentForm({ amount: '', paymentMethod: 'CASH' }); setPaymentRequestKey(requestId()); }} className="rounded-lg bg-[#b38059] px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Encaisser une tranche</button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr><td colSpan="7" className="bg-neutral-50 px-4 py-3">
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-neutral-700"><Users className="h-3.5 w-3.5" />Historique détaillé — {enrollment.studentName}</div>
                        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                          <table className="w-full min-w-[650px] text-left text-[11px]">
                            <thead className="border-b bg-neutral-50 text-neutral-500"><tr><th className="px-3 py-2">Reçu / date</th><th className="px-3 py-2">Tranche</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">État / opérateur</th><th className="px-3 py-2">Actions</th></tr></thead>
                            <tbody className="divide-y divide-neutral-100">
                              {enrollment.payments.map((payment) => (
                                <tr key={payment.id} className={payment.status === 'VOIDED' ? 'text-neutral-400 line-through' : ''}>
                                  <td className="px-3 py-2"><div className="font-mono font-bold">{payment.paymentNumber}</div><div>{new Date(payment.createdAt).toLocaleString('fr-FR')}</div></td>
                                  <td className="px-3 py-2">{payment.installmentNumber}</td>
                                  <td className="px-3 py-2">{getPaymentMethodLabel(payment.paymentMethod)}</td>
                                  <td className="px-3 py-2 text-right font-mono font-bold">{formatFCFA(payment.amount)}</td>
                                  <td className="px-3 py-2">{payment.status === 'VOIDED' ? `Régularisé: ${payment.voidReason}` : `Validé par ${payment.createdByName}`}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex gap-2">
                                      {payment.status === 'VALIDATED' && <button type="button" title="Réimprimer le reçu" onClick={() => triggerPrint(paymentReceipt(enrollment, payment, shopNames))} className="rounded p-1 text-[#9c6a41] hover:bg-neutral-100"><Printer className="h-3.5 w-3.5" /></button>}
                                      {payment.status === 'VALIDATED' && <button type="button" onClick={() => { setVoidTarget({ enrollment, payment }); setVoidReason(''); }} className="text-[10px] font-semibold text-rose-600 hover:underline">Régulariser</button>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {!enrollment.payments.length && <tr><td colSpan="6" className="px-3 py-3 text-center text-neutral-500">Aucun versement; l’inscription reste à régler.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!visibleEnrollments.length && !loading && <tr><td colSpan="7" className="px-4 py-8 text-center text-neutral-500">Aucun apprenant trouvé pour ces critères.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {summary?.byCourse?.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-neutral-900">Recettes des formations sur la période</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs"><thead className="border-b text-[10px] uppercase text-neutral-500"><tr><th className="py-2">Formation</th><th className="py-2">Shop</th><th className="py-2 text-right">Inscriptions actives</th><th className="py-2 text-right">Paiements reçus</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">{summary.byCourse.map((row) => <tr key={`${row.courseId}-${row.shopType}`}><td className="py-2 font-semibold">{row.courseName}</td><td className="py-2">{row.shopType === 'HOMME' ? shopNames.HOMME : shopNames.FEMME}</td><td className="py-2 text-right">{row.enrollmentCount}</td><td className="py-2 text-right font-mono font-bold">{formatFCFA(row.periodRevenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {!!summary?.audit?.length && (
        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-neutral-900">Journal des opérations ({summary.audit.length})</summary>
          <div className="mt-3 divide-y divide-neutral-100">
            {summary.audit.slice(0, 20).map((entry) => (
              <div key={entry.id} className="flex flex-wrap justify-between gap-1 py-2 text-[11px]">
                <span className="font-semibold">{auditDescription(entry)}{entry.shopType ? ` · ${entry.shopType}` : ''}</span>
                <span className="text-neutral-500">{new Date(entry.createdAt).toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {payingEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="training-payment-title">
          <form onSubmit={handlePaymentSubmit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between"><div><h2 id="training-payment-title" className="text-sm font-bold">Encaisser une tranche</h2><p className="mt-1 text-xs text-neutral-500">{payingEnrollment.studentName} · solde {formatFCFA(payingEnrollment.remaining)}</p></div><button type="button" onClick={() => setPayingEnrollment(null)} aria-label="Fermer"><X className="h-4 w-4" /></button></div>
            <input required min="1" max={payingEnrollment.remaining} step="1" type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="Montant en FCFA" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
            <select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs"><option value="CASH">Espèces</option><option value="ONLINE">Mobile Money / Wave</option><option value="ORANGE_MONEY">Orange Money</option></select>
            <button className="w-full rounded-lg bg-[#b38059] px-4 py-2.5 text-xs font-bold text-white">Valider et imprimer le reçu</button>
          </form>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="training-void-title">
          <form onSubmit={handleVoid} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between"><div><h2 id="training-void-title" className="text-sm font-bold">Régulariser un paiement</h2><p className="mt-1 text-xs text-neutral-500">{voidTarget.payment.paymentNumber} · {formatFCFA(voidTarget.payment.amount)}</p></div><button type="button" onClick={() => setVoidTarget(null)} aria-label="Fermer"><X className="h-4 w-4" /></button></div>
            <p className="text-xs text-neutral-600">Le paiement ne sera pas supprimé. Il sera exclu des recettes et le motif restera dans le journal d’audit.</p>
            <textarea required value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Motif de la régularisation" className="min-h-20 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs" />
            <button className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">Confirmer la régularisation</button>
          </form>
        </div>
      )}
    </div>
  );
}
