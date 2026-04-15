import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signIn, signUp } from '@/services/authService';
import type { User } from 'firebase/auth';

interface AuthGateProps {
  onSuccess: (user: User) => void;
}

type Mode = 'sign-in' | 'sign-up';

export function AuthGate({ onSuccess }: AuthGateProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* Ambient gradient */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-emerald-900/15 via-background to-background pointer-events-none"
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: 'easeOut' }}
        className="relative w-full max-w-sm flex flex-col items-center gap-7"
      >
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.img
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
            src="/grandslam/perfect-set-logo.png"
            alt="Perfect Set"
            className="h-20 w-20 object-contain drop-shadow-2xl"
            draggable={false}
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight">Perfect Set</h1>
            <p className="text-[13px] text-muted-foreground/65 mt-1.5 leading-relaxed">
              Grand Slam &amp; Masters 1000 bracket predictions
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full bg-card border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
          {/* Mode tabs */}
          <div
            className="flex rounded-xl bg-muted/20 p-1 gap-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5',
                  mode === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground/55 hover:text-foreground/80',
                )}
              >
                {m === 'sign-in'
                  ? <><LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Sign In</>
                  : <><UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Create Account</>
                }
              </button>
            ))}
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
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'sign-up' ? 'At least 6 characters' : '••••••••'}
                className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
              />
            </label>

            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  key="error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5 border border-red-500/20"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-xl mt-1 h-11 text-[14px] font-bold"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Please wait…</>
              ) : mode === 'sign-in' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] text-muted-foreground/40 leading-relaxed px-2">
          A Perfect Set account lets you join bracket pools, track predictions,
          and compete with friends across all devices.
        </p>
      </motion.div>
    </div>
  );
}
