import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signIn, signUp } from '@/services/authService';
import type { User } from 'firebase/auth';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
  onContinueAsGuest?: () => Promise<void>;
  defaultMode?: 'sign-in' | 'sign-up';
}

export function AuthModal({ open, onClose, onSuccess, onContinueAsGuest, defaultMode = 'sign-in' }: AuthModalProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset mode to the requested default each time the modal opens so stale
  // state from a previous session never causes the wrong form to appear.
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
      resetForm();
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    setError('');
    setLoading(true);
    try {
      await onContinueAsGuest?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue as guest.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setError('');
    setMode(m => m === 'sign-in' ? 'sign-up' : 'sign-in');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-90 bg-card border border-white/10 rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {mode === 'sign-in'
                  ? <LogIn className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  : <UserPlus className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                }
                <h2 className="text-sm font-bold">
                  {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
                </h2>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={handleClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'sign-up' ? 'At least 6 characters' : '••••••••'}
                  className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                />
              </label>

              {error && (
                <p role="alert" className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5 border border-red-500/20">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-xl mt-1"
              >
                {loading ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" /> Please wait…</>
                ) : mode === 'sign-in' ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            {/* Mode switch */}
            <p className="text-center text-xs text-muted-foreground/60">
              {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors underline underline-offset-2"
              >
                {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            {/* Divider */}
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-px bg-border/30" aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground/50">or</span>
              <div className="flex-1 h-px bg-border/30" aria-hidden="true" />
            </div>

            {/* Guest button */}
            {onContinueAsGuest && (
              <Button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={loading}
                variant="outline"
                className="w-full rounded-xl border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/4"
              >
                {loading ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" /> Please wait…</>
                ) : (
                  'Continue as Guest'
                )}
              </Button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
