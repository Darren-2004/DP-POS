import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
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
  const [accessToken, setAccessToken] = useState('');

  const { greeting, dateLabel } = useMemo(() => {
    const now = new Date();
    const raw = now.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return {
      greeting: now.getHours() < 18 ? 'Bonjour' : 'Bonsoir',
      dateLabel: raw.charAt(0).toUpperCase() + raw.slice(1),
    };
  }, []);

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
    setNewPin('');
    setConfirmPin('');
    setAuthError('');
    setResetPinStep(false);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setEnteredPin('');
    setNewPin('');
    setConfirmPin('');
    setResetPinStep(false);
    setAuthError('');
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
          setTimeout(() => handleResetPinSubmitWith(newPin, next), 50);
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

      localStorage.setItem('pos_user', JSON.stringify(data));
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

  const handleResetPinSubmitWith = async (newValue, confirmValue) => {
    if (newValue.length < 4 || confirmValue.length < 4) {
      setAuthError('Le code PIN doit comporter 4 chiffres');
      return;
    }
    if (newValue !== confirmValue) {
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
        body: JSON.stringify({ userId: selectedUser.id, oldPin: enteredPin, newPin: newValue }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Erreur lors de la mise à jour du code PIN');
        setIsSubmitting(false);
        return;
      }

      const authenticatedUser = { ...selectedUser, needsPinReset: false, accessToken };
      localStorage.setItem('pos_user', JSON.stringify(authenticatedUser));
      setCurrentUser(authenticatedUser);
      setCurrentView(selectedUser.role === 'CASHIER' ? 'cashier' : 'admin');
    } catch {
      setAuthError('Erreur de communication avec le serveur');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPinSubmit = () => handleResetPinSubmitWith(newPin, confirmPin);

  const getRoleLabel = (role) => {
    if (role === 'ADMIN') return 'Administrateur';
    if (role === 'MANAGER') return 'Gérant(e)';
    return 'Caissier/ère';
  };

  const currentPin = resetPinStep ? (newPin.length < 4 ? newPin : confirmPin) : enteredPin;
  const canSubmit = resetPinStep ? confirmPin.length === 4 : enteredPin.length === 4;
  const safeUsers = users || [];

  const pinLabel = resetPinStep
    ? newPin.length < 4
      ? 'Choisissez un nouveau code'
      : 'Confirmez le nouveau code'
    : 'Code PIN';

  const stepKey = selectedUser ? (resetPinStep ? 'reset' : 'pin') : 'list';

  const numKey =
    'h-16 border-b border-r border-[#d9cdbf] bg-[#fbf8f4] font-serif text-2xl text-[#2c1e14] transition-colors hover:bg-white active:bg-[#efe5da] disabled:opacity-50';

  return (
    <div className="flex h-full w-full bg-[#f6f1ea]">
      <style>{`
        @keyframes lv-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes lv-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }
        .lv-fade { animation: lv-fade .35s ease both; }
        .lv-shake { animation: lv-shake .35s ease; }
      `}</style>

      {/* Brand panel */}
      <aside
        className="relative hidden w-[46%] max-w-[760px] shrink-0 bg-[#1c130d] bg-cover bg-center lg:block"
        style={{ backgroundImage: "url('/salon.jfif')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#150e0a] via-[#150e0a]/55 to-[#150e0a]/25" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-14">
          <div className="mb-6 h-px w-12 bg-[#b38059]" />
          <h1 className="font-serif text-6xl font-semibold leading-[0.95] tracking-tight text-[#f6f1ea] xl:text-7xl">
            Salon
            <br />
            de Beauté
          </h1>
          <p className="mt-6 text-xs uppercase tracking-[0.25em] text-[#f6f1ea]/60">{dateLabel}</p>
        </div>
      </aside>

      {/* Action panel */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-10 sm:px-8">
          {/* Compact brand for screens without the brand panel */}
          <div className="mb-10 lg:hidden">
            <div className="mb-3 h-px w-10 bg-[#b38059]" />
            <p className="font-serif text-2xl font-semibold text-[#2c1e14]">Salon de Beauté</p>
          </div>

          <div key={stepKey} className="lv-fade">
            {!selectedUser ? (
              <div>
                <h2 className="font-serif text-5xl text-[#2c1e14]">{greeting}</h2>
                <p className="mt-2 text-sm text-[#7c6858]">Choisissez votre profil.</p>

                <div className="mt-8 border-t border-[#d9cdbf]">
                  {usersLoading ? (
                    <div className="animate-pulse">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-5 border-b border-[#d9cdbf] py-5">
                          <div className="h-3 w-6 bg-[#e6dccf]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-5 w-40 bg-[#e6dccf]" />
                            <div className="h-2.5 w-24 bg-[#eee6db]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : usersError ? (
                    <div className="py-10">
                      <p className="text-sm text-red-700">{usersError}</p>
                      {onRetryUsers && (
                        <button
                          type="button"
                          onClick={onRetryUsers}
                          className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#825534] underline underline-offset-4"
                        >
                          Réessayer
                        </button>
                      )}
                    </div>
                  ) : safeUsers.length === 0 ? (
                    <div className="py-10">
                      <p className="text-sm text-[#7c6858]">Aucun profil disponible.</p>
                      {onRetryUsers && (
                        <button
                          type="button"
                          onClick={onRetryUsers}
                          className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#825534] underline underline-offset-4"
                        >
                          Rafraîchir
                        </button>
                      )}
                    </div>
                  ) : (
                    safeUsers.map((u, i) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u)}
                        className="group flex w-full items-center gap-5 border-b border-[#d9cdbf] px-1 py-5 text-left transition-colors hover:bg-white"
                      >
                        <span className="w-6 shrink-0 font-mono text-[11px] text-[#a39080]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-serif text-2xl capitalize text-[#2c1e14]">
                            {u.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.18em] text-[#7c6858]">
                            {getRoleLabel(u.role)}
                          </span>
                        </span>
                        <ArrowRight className="h-5 w-5 shrink-0 -translate-x-2 text-[#b38059] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={handleBack}
                  className="mb-8 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c6858] transition-colors hover:text-[#2c1e14]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Changer de profil</span>
                </button>

                <h2 className="truncate font-serif text-4xl capitalize text-[#2c1e14]">
                  {selectedUser.name}
                </h2>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#7c6858]">
                  {getRoleLabel(selectedUser.role)}
                </p>

                <p className="mb-5 mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-[#7c6858]">
                  {pinLabel}
                </p>

                {/* PIN slots */}
                <div className={`flex gap-3 ${authError ? 'lv-shake' : ''}`}>
                  {[0, 1, 2, 3].map((idx) => {
                    const filled = idx < currentPin.length;
                    return (
                      <div
                        key={idx}
                        className={cx(
                          'flex h-14 w-14 items-end justify-center border-b-2 pb-3 transition-colors duration-100',
                          authError
                            ? 'border-red-500'
                            : filled
                              ? 'border-[#2c1e14]'
                              : 'border-[#cfc2b3]'
                        )}
                      >
                        {filled && <span className="block h-2.5 w-2.5 bg-[#2c1e14]" />}
                      </div>
                    );
                  })}
                </div>

                <p className="mb-6 mt-3 h-5 text-xs font-medium text-red-600">{authError}</p>

                {/* Keypad */}
                <div className="grid grid-cols-3 border-l border-t border-[#d9cdbf]">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(String(num))}
                      disabled={isSubmitting}
                      className={numKey}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleKeypadClear}
                    disabled={isSubmitting}
                    className="h-16 border-b border-r border-[#d9cdbf] bg-[#f6f1ea] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c6858] transition-colors hover:bg-[#efe5da] active:bg-[#e6dccf] disabled:opacity-50"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    disabled={isSubmitting}
                    className={numKey}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={resetPinStep ? handleResetPinSubmit : handleLoginSubmit}
                    disabled={isSubmitting || !canSubmit}
                    className="flex h-16 items-center justify-center border-b border-r border-[#d9cdbf] bg-[#b38059] text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#9e6d47] disabled:bg-[#e2d3c4]"
                  >
                    {isSubmitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : 'Valider'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}