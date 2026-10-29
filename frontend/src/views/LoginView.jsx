import React, { useState, useEffect, useRef } from 'react';
import { Scissors, ArrowLeft, LoaderCircle } from 'lucide-react';
import { cx } from '../utils/helpers';
import { API_BASE } from '../utils/constants';

export default function LoginView({
  users,
  serverOnline,
  setCurrentUser,
  setCurrentView,
  usersLoading = false,
  usersError = '',
  onRetryUsers,
}) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetPinStep, setResetPinStep] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedShopFilter, setSelectedShopFilter] = useState('ALL');
  const [accessToken, setAccessToken] = useState('');

  // Always refresh user list on mount
  useEffect(() => {
    if (onRetryUsers) onRetryUsers();
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    if (!selectedUser || isSubmitting) return;

    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        handleKeypadClear();
      } else if (e.key === 'Enter') {
        resetPinStep ? handleResetPinSubmit() : handleLoginSubmit();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedUser, resetPinStep, newPin, confirmPin, enteredPin, isSubmitting]);

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setAccessToken('');
    setEnteredPin('');
    setAuthError('');
    setResetPinStep(false);
  };

  const handleKeypadPress = (val) => {
    if (isSubmitting) return;
    setAuthError('');

    if (resetPinStep) {
      if (newPin.length < 4) {
        setNewPin((prev) => prev + val);
      } else if (confirmPin.length < 4) {
        const next = confirmPin + val;
        setConfirmPin(next);
        if (next.length === 4) {
          setTimeout(handleResetPinSubmit, 50);
        }
      }
    } else {
      if (enteredPin.length < 4) {
        const next = enteredPin + val;
        setEnteredPin(next);
        if (next.length === 4) {
          setTimeout(() => handleLoginSubmitWith(next), 50);
        }
      }
    }
  };

  const handleKeypadClear = () => {
    if (isSubmitting) return;
    setAuthError('');

    if (resetPinStep) {
      if (confirmPin.length > 0) setConfirmPin((prev) => prev.slice(0, -1));
      else setNewPin((prev) => prev.slice(0, -1));
    } else {
      setEnteredPin((prev) => prev.slice(0, -1));
    }
  };

  const handleLoginSubmitWith = async (pinValue) => {
    if (!selectedUser || !pinValue || isSubmitting) return;
    setIsSubmitting(true);
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, pin: pinValue }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(
          data.error ||
            (res.status === 404
              ? 'Utilisateur introuvable. Rafraîchissez la page.'
              : 'Code PIN incorrect')
        );
        setEnteredPin('');
        setIsSubmitting(false);
        return;
      }

      if (data.needsPinReset) {
        setAccessToken(data.accessToken);
        setResetPinStep(true);
        setNewPin('');
        setConfirmPin('');
        setIsSubmitting(false);
        return;
      }

      setCurrentUser(data);
      setCurrentView(data.role === 'CASHIER' ? 'cashier' : 'admin');
    } catch {
      setAuthError('Erreur de connexion au serveur');
      setEnteredPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = () => handleLoginSubmitWith(enteredPin);

  const handleResetPinSubmit = async () => {
    if (newPin.length < 4 || confirmPin.length < 4) {
      setAuthError('Le code PIN doit comporter au moins 4 chiffres');
      return;
    }
    if (newPin !== confirmPin) {
      setAuthError('Les deux codes PIN ne correspondent pas');
      setConfirmPin('');
      return;
    }

    setIsSubmitting(true);
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/auth/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, oldPin: enteredPin, newPin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Erreur lors de la mise à jour du code PIN');
        setIsSubmitting(false);
        return;
      }

      setCurrentUser({ ...selectedUser, needsPinReset: false, accessToken });
      setCurrentView(selectedUser.role === 'CASHIER' ? 'cashier' : 'admin');
    } catch {
      setAuthError('Erreur de communication avec le serveur');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role) => {
    if (role === 'ADMIN')
      return {
        label: 'Administrateur',
        color: 'bg-[#b38059]/15 text-[#825534] border-[#b38059]/30',
      };
    if (role === 'MANAGER')
      return {
        label: 'Gérant(e)',
        color: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    return {
      label: 'Caissier/ère',
      color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  };

  const filteredUsers = (users || []).filter((u) => {
    if (selectedShopFilter === 'ALL') return true;
    return !u.shopType || u.shopType === 'ALL' || u.shopType === selectedShopFilter;
  });

  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center p-4">
      {/* Brand Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[#b38059]/25 bg-white text-[#b38059] shadow-md mb-3">
          <Scissors className="h-8 w-8 stroke-[1.75]" />
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2c1e14] sm:text-3xl">
          SALON DE BEAUTÉ
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-[#7c6858]">
          Barber & Coiffure · Soins · Manucure · Spa
        </p>
      </div>

      {/* Main Card Container */}
      <div className="w-full rounded-2xl border border-[rgba(74,50,34,0.1)] bg-white p-6 shadow-xl shadow-[#2c1e14]/5 md:p-8">
        {!selectedUser ? (
          <div>
            {/* Header / Filter Toolbar */}
            <div className="mb-4 flex flex-col items-center justify-between gap-3 border-b border-[rgba(74,50,34,0.08)] pb-4 sm:flex-row">
              <div>
                <h2 className="text-base font-semibold text-[#2c1e14]">Sélectionnez votre profil</h2>
                <p className="text-xs text-[#7c6858]">Choisissez votre compte pour ouvrir la session</p>
              </div>

              {/* Shop Switcher */}
              <div className="inline-flex items-center rounded-xl border border-[rgba(74,50,34,0.12)] bg-[#f9f5f0] p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setSelectedShopFilter('ALL')}
                  className={cx(
                    'rounded-lg px-3 py-1.5 transition',
                    selectedShopFilter === 'ALL'
                      ? 'bg-white font-semibold text-[#2c1e14] shadow-sm'
                      : 'text-[#7c6858] hover:text-[#2c1e14]'
                  )}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedShopFilter('HOMME')}
                  className={cx(
                    'rounded-lg px-3 py-1.5 transition',
                    selectedShopFilter === 'HOMME'
                      ? 'bg-white font-semibold text-[#2c1e14] shadow-sm'
                      : 'text-[#7c6858] hover:text-[#2c1e14]'
                  )}
                >
                  Shop 1
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedShopFilter('FEMME')}
                  className={cx(
                    'rounded-lg px-3 py-1.5 transition',
                    selectedShopFilter === 'FEMME'
                      ? 'bg-white font-semibold text-[#2c1e14] shadow-sm'
                      : 'text-[#7c6858] hover:text-[#2c1e14]'
                  )}
                >
                  Shop 2
                </button>
              </div>
            </div>

            {/* Content State: Loading / Empty / Users Grid */}
            {usersLoading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3">
                <LoaderCircle className="h-6 w-6 animate-spin text-[#b38059]" />
                <span className="text-xs text-[#7c6858]">Chargement des comptes...</span>
              </div>
            ) : usersError ? (
              <div className="py-12 text-center">
                <p className="text-sm text-red-700">{usersError}</p>
                {onRetryUsers && (
                  <button
                    type="button"
                    onClick={onRetryUsers}
                    className="mt-3 text-xs font-medium text-[#b38059] underline"
                  >
                    Réessayer
                  </button>
                )}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[#7c6858]">Aucun utilisateur trouvé.</p>
                {onRetryUsers && (
                  <button
                    type="button"
                    onClick={onRetryUsers}
                    className="mt-3 text-xs font-medium text-[#b38059] underline"
                  >
                    Rafraîchir
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {filteredUsers.map((u) => {
                  const badge = getRoleBadge(u.role);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className="group flex items-center gap-3.5 rounded-xl border border-[rgba(74,50,34,0.08)] bg-[#fdfbf7] p-3.5 text-left transition hover:border-[#b38059] hover:bg-white hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f3ece4] text-base font-semibold text-[#825534] transition group-hover:bg-[#b38059] group-hover:text-white">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#2c1e14]">{u.name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={cx(
                              'inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none',
                              badge.color
                            )}
                          >
                            {badge.label}
                          </span>
                          {u.shopType && u.shopType !== 'ALL' && (
                            <span className="text-[10px] font-medium text-[#7c6858]">
                              · {u.shopType === 'HOMME' ? 'Shop 1' : 'Shop 2'}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* PIN Input & Keypad Step */
          <div className="mx-auto max-w-sm">
            <button
              type="button"
              onClick={() => {
                setSelectedUser(null);
                setEnteredPin('');
                setAuthError('');
              }}
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#7c6858] transition hover:text-[#2c1e14]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Changer d'utilisateur</span>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#b38059]/15 text-lg font-bold text-[#825534]">
                {selectedUser.name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold text-[#2c1e14]">{selectedUser.name}</h2>
              <p className="text-xs text-[#7c6858]">{getRoleBadge(selectedUser.role).label}</p>
            </div>

            {/* PIN Display Indicators */}
            <div className="mb-5 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#7c6858]">
                {resetPinStep
                  ? newPin.length < 4
                    ? 'Nouveau code PIN'
                    : 'Confirmez le nouveau PIN'
                  : 'Saisissez votre code PIN'}
              </p>
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((idx) => {
                  const currentPin = resetPinStep
                    ? newPin.length < 4
                      ? newPin
                      : confirmPin
                    : enteredPin;
                  const isFilled = idx < currentPin.length;
                  return (
                    <div
                      key={idx}
                      className={cx(
                        'h-4 w-4 rounded-full border-2 transition-all duration-150',
                        isFilled
                          ? 'scale-110 border-[#b38059] bg-[#b38059]'
                          : 'border-[rgba(74,50,34,0.2)] bg-transparent'
                      )}
                    />
                  );
                })}
              </div>
              {authError && (
                <p className="mt-3 inline-block rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                  {authError}
                </p>
              )}
            </div>

            {/* On-Screen Keypad */}
            <div className="mb-2 grid grid-cols-3 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(String(num))}
                  disabled={isSubmitting}
                  className="flex h-14 items-center justify-center rounded-xl border border-[rgba(74,50,34,0.08)] bg-[#fdfbf7] text-xl font-semibold text-[#2c1e14] shadow-sm transition hover:border-[#b38059] hover:bg-white active:scale-95 disabled:opacity-50"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadClear}
                disabled={isSubmitting}
                className="flex h-14 items-center justify-center rounded-xl border border-[rgba(74,50,34,0.08)] bg-[#f9f5f0] text-xs font-semibold text-[#7c6858] shadow-sm transition hover:bg-[#f3ece4] active:scale-95"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                disabled={isSubmitting}
                className="flex h-14 items-center justify-center rounded-xl border border-[rgba(74,50,34,0.08)] bg-[#fdfbf7] text-xl font-semibold text-[#2c1e14] shadow-sm transition hover:border-[#b38059] hover:bg-white active:scale-95 disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={resetPinStep ? handleResetPinSubmit : handleLoginSubmit}
                disabled={
                  isSubmitting ||
                  (resetPinStep ? confirmPin.length < 4 : enteredPin.length < 4)
                }
                className="flex h-14 items-center justify-center rounded-xl bg-[#b38059] text-xs font-semibold text-white shadow-md shadow-[#b38059]/20 transition hover:bg-[#9e6d47] active:scale-95 disabled:opacity-40"
              >
                {isSubmitting ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  'Valider'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}