import { useRef, useEffect, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface UseBracketCanvasOptions {
  /** Current zoom level (0.2 – 2.0). Controlled by parent. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * High-performance bracket canvas interaction hook.
 *
 * Key design choices:
 * - All pan state is kept in refs → zero React re-renders during drag
 * - Direct DOM scroll manipulation via requestAnimationFrame (mouse drag)
 * - Single-finger touch panning delegated to native browser scroll (smooth momentum)
 * - Pinch-to-zoom via native touch events (passive: false to allow preventDefault)
 * - Mouse-wheel zoom via native wheel event (passive: false)
 * - Pointer events used for mouse/stylus drag; touch events used for pinch-to-zoom only
 */
export function useBracketCanvas({
  zoom,
  onZoomChange,
  minZoom = 0.2,
  maxZoom = 2.0,
}: UseBracketCanvasOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep a ref to the latest zoom / callback so event handlers never close over stale values
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  // Drag state (never in React state — kept as refs)
  const isDraggingRef = useRef(false);
  const startScrollRef = useRef({ x: 0, y: 0 });
  const startClientRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);

  // ─── Pointer (mouse / stylus) drag handlers ─────────────────────────────────

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // Ignore touch pointers — handled by our native touch listeners below
    if (e.pointerType === 'touch') return;
    isDraggingRef.current = true;
    startScrollRef.current = {
      x: containerRef.current?.scrollLeft ?? 0,
      y: containerRef.current?.scrollTop ?? 0,
    };
    startClientRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || e.pointerType === 'touch') return;
    const dx = e.clientX - startClientRef.current.x;
    const dy = e.clientY - startClientRef.current.y;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollLeft = startScrollRef.current.x - dx;
        containerRef.current.scrollTop = startScrollRef.current.y - dy;
      }
    });
  }, []);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    isDraggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (containerRef.current) containerRef.current.style.cursor = '';
  }, []);

  // ─── Native touch + wheel event listeners ────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Pinch tracking
    let initialPinchDist: number | null = null;
    let initialZoomAtPinch = zoomRef.current;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Begin pinch gesture — prevent browser default (viewport zoom)
        initialPinchDist = getDistance(e.touches[0], e.touches[1]);
        initialZoomAtPinch = zoomRef.current;
        e.preventDefault();
      }
      // Single-finger panning is handled natively by the browser (smooth momentum scroll)
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDist !== null) {
        // Two-finger pinch: custom zoom, prevent browser handling
        e.preventDefault();
        const dist = getDistance(e.touches[0], e.touches[1]);
        const scale = dist / initialPinchDist;
        const newZoom = Math.max(
          minZoom,
          Math.min(maxZoom, initialZoomAtPinch * scale),
        );
        onZoomChangeRef.current(newZoom);
      }
      // Single-finger pan is left to native browser scroll for smooth momentum
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
      }
    };

    // Mouse wheel zoom (Ctrl/Cmd + scroll or trackpad pinch)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomRef.current + delta));
        onZoomChangeRef.current(newZoom);
      }
    };

    // passive: false is required for preventDefault() on touchstart/touchmove for pinch
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minZoom, maxZoom]); // stable deps only — zoom/callbacks accessed via refs

  return {
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
