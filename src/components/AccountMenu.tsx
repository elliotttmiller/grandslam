import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCircle, LogOut, LogIn, UserPlus, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { User } from 'firebase/auth';

interface AccountMenuProps {
  authChecked: boolean;
  authUser: User | null;
  onSignOut: () => Promise<void>;
  onSignInClick: () => void;
  onMyPoolsClick: () => void;
}

export function AccountMenu({
  authChecked,
  authUser,
  onSignOut,
  onSignInClick,
  onMyPoolsClick,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isSignedIn = authUser && !authUser.isAnonymous;

  const handleSignOut = async () => {
    setIsOpen(false);
    await onSignOut();
  };

  const handleMyPools = () => {
    setIsOpen(false);
    onMyPoolsClick();
  };

  const handleSignIn = () => {
    setIsOpen(false);
    onSignInClick();
  };

  if (!authChecked) {
    return null;
  }

  return (
    <div className="relative">
      {/* Account Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={isSignedIn ? `Signed in as ${authUser?.email ?? 'user'}` : 'Account menu'}
        aria-label={isSignedIn ? `Signed in as ${authUser?.email ?? 'user'}` : 'Account menu'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center justify-center h-9 w-9 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all duration-150"
      >
        <UserCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
              aria-hidden="true"
            />

            {/* Menu */}
            <motion.div
              role="menu"
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute top-full right-0 mt-2 w-48 bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              {isSignedIn ? (
                <>
                  {/* User Email */}
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">
                      Signed In
                    </p>
                    <p className="text-xs font-semibold text-emerald-400 truncate mt-1">
                      {authUser?.email}
                    </p>
                  </div>

                  {/* My Pools */}
                  <button
                    role="menuitem"
                    onClick={handleMyPools}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-white/6 transition-colors text-left border-b border-white/5 last:border-b-0"
                  >
                    <LayoutGrid className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
                    <span>My Pools</span>
                  </button>

                  {/* Sign Out */}
                  <button
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Sign In */}
                  <button
                    role="menuitem"
                    onClick={handleSignIn}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-white/6 transition-colors text-left border-b border-white/5"
                  >
                    <LogIn className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
                    <span>Sign In</span>
                  </button>

                  {/* Sign Up */}
                  <button
                    role="menuitem"
                    onClick={handleSignIn}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors text-left"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Create Account</span>
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
