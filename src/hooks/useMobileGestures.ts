import { useEffect, useRef, useCallback } from 'react';

interface GestureCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
}

const SWIPE_THRESHOLD = 50; // Minimum distance for a swipe (pixels)
const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity for a swipe
const LONG_PRESS_DURATION = 500; // Milliseconds
const DOUBLE_TAP_DELAY = 300; // Milliseconds

export function useMobileGestures(element: React.RefObject<HTMLElement>, callbacks: GestureCallbacks) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastTapTime = useRef(0);

  const handleLongPress = useCallback(() => {
    if (callbacks.onLongPress) {
      callbacks.onLongPress();
      // Haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }
  }, [callbacks]);

  const handleDoubleTap = useCallback(() => {
    if (callbacks.onDoubleTap) {
      callbacks.onDoubleTap();
      if ('vibrate' in navigator) {
        navigator.vibrate([20, 10, 20]);
      }
    }
  }, [callbacks]);

  useEffect(() => {
    const el = element.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();

      // Clear previous long press timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }

      // Start long press timer
      longPressTimer.current = setTimeout(() => {
        handleLongPress();
      }, LONG_PRESS_DURATION);

      // Detect double tap
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime.current;
      if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
        handleDoubleTap();
      }
      lastTapTime.current = now;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Clear long press timer if still running
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const touch = e.changedTouches[0];
      const touchEndX = touch.clientX;
      const touchEndY = touch.clientY;
      const touchDuration = Date.now() - touchStartTime.current;

      // Don't process swipe if it was a long press
      if (touchDuration > LONG_PRESS_DURATION) {
        return;
      }

      const diffX = touchStartX.current - touchEndX;
      const diffY = touchStartY.current - touchEndY;
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);
      const velocity = distance / touchDuration;

      // Check if it's a valid swipe
      if (distance > SWIPE_THRESHOLD && velocity > SWIPE_VELOCITY_THRESHOLD) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          // Horizontal swipe
          if (diffX > 0 && callbacks.onSwipeLeft) {
            callbacks.onSwipeLeft();
            if ('vibrate' in navigator) {
              navigator.vibrate(20);
            }
          } else if (diffX < 0 && callbacks.onSwipeRight) {
            callbacks.onSwipeRight();
            if ('vibrate' in navigator) {
              navigator.vibrate(20);
            }
          }
        } else {
          // Vertical swipe
          if (diffY > 0 && callbacks.onSwipeUp) {
            callbacks.onSwipeUp();
            if ('vibrate' in navigator) {
              navigator.vibrate(20);
            }
          } else if (diffY < 0 && callbacks.onSwipeDown) {
            callbacks.onSwipeDown();
            if ('vibrate' in navigator) {
              navigator.vibrate(20);
            }
          }
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [element, callbacks, handleLongPress, handleDoubleTap]);
}

/**
 * Hook for pull-to-refresh on mobile
 */
export function usePullToRefresh(element: React.RefObject<HTMLElement>, onRefresh: () => Promise<void>) {
  const pullStartY = useRef(0);
  const isRefreshing = useRef(false);

  useEffect(() => {
    const el = element.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const scrollTop = el.scrollTop;
      if (scrollTop === 0) {
        pullStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (pullStartY.current === 0 || isRefreshing.current) return;

      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - pullStartY.current;

      // Show pull-to-refresh indicator if pulling more than 80px
      if (pullDistance > 80) {
        // TODO: Dispatch event to show pull-to-refresh UI
      }
    };

    const handleTouchEnd = async () => {
      const currentY = pullStartY.current;
      pullStartY.current = 0;

      if (currentY > 0 && el.scrollTop === 0) {
        isRefreshing.current = true;
        try {
          await onRefresh();
        } finally {
          isRefreshing.current = false;
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [element, onRefresh]);
}
