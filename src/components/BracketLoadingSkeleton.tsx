import { motion } from 'framer-motion';

/** A single shimmer match-card skeleton that mimics the MatchCard shape. */
function SkeletonMatchCard() {
  return (
    <div className="py-1">
      <div className="w-56 rounded-xl border border-border/20 bg-card/40 overflow-hidden">
        {/* Player 1 row */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border/20">
          <div className="skeleton w-4.5 h-3 rounded-sm shrink-0" />
          <div className="skeleton h-3 rounded-md flex-1" />
        </div>
        {/* Player 2 row */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="skeleton w-4.5 h-3 rounded-sm shrink-0" />
          <div className="skeleton h-3 rounded-md w-3/4" />
        </div>
      </div>
    </div>
  );
}

/** Two sibling skeleton cards stacked vertically (left side of bracket node). */
function SkeletonPair() {
  return (
    <div className="flex flex-col justify-center gap-2">
      <SkeletonMatchCard />
      <SkeletonMatchCard />
    </div>
  );
}

/**
 * Bracket canvas loading skeleton.
 *
 * Shows a 3-level deep ghost bracket tree plus a smooth arc spinner and label
 * so the user sees meaningful structure instead of a blank screen.
 */
export function BracketLoadingSkeleton() {
  return (
    <div className="w-full h-full flex flex-col items-start justify-start p-6 sm:p-10 overflow-hidden">
      {/* Spinner + label pinned near the top-centre */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full flex flex-col items-center gap-3 mb-8"
      >
        {/* Modern arc spinner */}
        <div className="relative flex items-center justify-center">
          {/* Static track */}
          <div className="w-10 h-10 rounded-full border-[3px] border-white/[0.07]" />
          {/* Spinning arc */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            className="absolute w-10 h-10 rounded-full border-[3px] border-transparent border-t-emerald-400"
          />
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm font-medium text-muted-foreground/60 tracking-wide"
        >
          Building bracket…
        </motion.p>
      </motion.div>

      {/* Ghost bracket tree — 3 rounds visible */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex items-center gap-0 select-none pointer-events-none"
        aria-hidden="true"
      >
        {/* Round 1 pairs (deepest level) */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <SkeletonPair />
            <SkeletonPair />
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <SkeletonPair />
            <SkeletonPair />
          </div>
        </div>

        {/* Connector lines + Round 2 */}
        <div className="flex flex-col gap-2">
          {[0, 1].map(i => (
            <div key={i} className="flex items-center">
              <div className="w-6 h-px bg-gradient-to-r from-border/10 to-border/30" />
              <SkeletonMatchCard />
            </div>
          ))}
        </div>

        {/* Connector line + Round 3 (QF) */}
        <div className="flex items-center">
          <div className="w-6 h-px bg-gradient-to-r from-border/10 to-border/30" />
          <SkeletonMatchCard />
        </div>
      </motion.div>
    </div>
  );
}

/** A single skeleton row mimicking a MatchPickCard player slot. */
function SkeletonPlayerRow({ isTop }: { isTop: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 min-h-14 ${isTop ? 'border-b border-border/15' : ''}`}
    >
      {/* Seed */}
      <div className="skeleton w-5 h-3 rounded-sm shrink-0" />
      {/* Name block */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="skeleton h-3.5 rounded-md w-3/5" />
        <div className="skeleton h-2.5 rounded-md w-2/5" />
      </div>
      {/* Pick circle */}
      <div className="skeleton shrink-0 h-7 w-7 rounded-full" />
    </div>
  );
}

/** A skeleton that mimics one MatchPickCard card. */
function SkeletonPickCard() {
  return (
    <div className="rounded-2xl border border-border/30 bg-card/40 overflow-hidden">
      <SkeletonPlayerRow isTop={true} />
      <div className="flex items-center px-4 py-1.5 gap-3">
        <div className="h-px flex-1 bg-border/10" />
        <div className="skeleton w-4 h-2 rounded-sm" />
        <div className="h-px flex-1 bg-border/10" />
      </div>
      <SkeletonPlayerRow isTop={false} />
    </div>
  );
}

/**
 * Round-list loading skeleton.
 *
 * Shows the round header placeholder and several ghost pick-card rows with
 * shimmer animation while the bracket data is fetched.
 */
export function RoundListSkeleton() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar">
      <div
        className="px-4 py-4 max-w-lg mx-auto"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Spinner + label */}
        <div className="flex flex-col items-center gap-3 py-6 mb-2">
          <div className="relative flex items-center justify-center">
            <div className="w-9 h-9 rounded-full border-[3px] border-white/[0.07]" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              className="absolute w-9 h-9 rounded-full border-[3px] border-transparent border-t-emerald-400"
            />
          </div>
          <p className="text-sm font-medium text-muted-foreground/60 tracking-wide">
            Building bracket…
          </p>
        </div>

        {/* Skeleton header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col gap-1.5">
            <div className="skeleton h-3 w-20 rounded-md" />
            <div className="skeleton h-2.5 w-16 rounded-md" />
          </div>
          <div className="skeleton h-10 w-10 rounded-full" />
        </div>

        {/* Ghost pick cards */}
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonPickCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
