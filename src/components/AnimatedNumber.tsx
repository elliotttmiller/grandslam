import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  duration?: number;
}

/**
 * Smoothly counts up/down to the given `value` whenever it changes.
 * Uses Framer Motion's `animate` utility (no DOM re-renders during tween).
 */
export function AnimatedNumber({ value, className, duration = 0.6 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;
    prevRef.current = value;

    const controls = animate(prev, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });

    return () => controls.stop();
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}
