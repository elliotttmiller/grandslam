import { motion, AnimatePresence } from 'framer-motion';

// Particles generated once at module load time (stable randomness)
const COLORS = ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b', '#a78bfa', '#60a5fa', '#f472b6'];

const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2;
  const spread = 90 + Math.floor(i * 4.7) % 120;
  return {
    id: i,
    x: Math.cos(angle) * spread * (0.6 + (i % 3) * 0.3),
    y: Math.sin(angle) * spread * (0.6 + (i % 3) * 0.3) - 40,
    color: COLORS[i % COLORS.length],
    size: 5 + (i % 4) * 2,
    delay: (i % 4) * 0.06,
    rotate: (i % 2 === 0 ? 1 : -1) * (180 + (i % 3) * 120),
  };
});

interface CelebrationOverlayProps {
  visible: boolean;
  championName?: string;
}

export function CelebrationOverlay({ visible, championName }: CelebrationOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="celebration"
          className="fixed inset-0 z-[100] pointer-events-none flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Dark vignette overlay */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

          {/* Particles */}
          {PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-[2px]"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                left: '50%',
                top: '50%',
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{
                x: p.x,
                y: p.y,
                opacity: 0,
                scale: 0.2,
                rotate: p.rotate,
              }}
              transition={{ duration: 1.1, delay: p.delay, ease: [0.2, 0, 0.4, 1] }}
            />
          ))}

          {/* Champion card */}
          <motion.div
            className="relative flex flex-col items-center gap-3 z-10"
            initial={{ scale: 0.5, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.05 }}
          >
            <motion.div
              className="text-6xl select-none"
              animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.7, delay: 0.15 }}
            >
              🏆
            </motion.div>
            <div className="flex flex-col items-center gap-1 bg-card/90 border border-emerald-500/40 px-7 py-3.5 rounded-2xl shadow-2xl shadow-emerald-950/60 backdrop-blur-md">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400/70">
                Champion
              </span>
              <span className="text-lg font-black text-white text-center leading-tight max-w-[220px]">
                {championName ?? 'Winner!'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
