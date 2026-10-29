import { useCallback, useEffect, useRef } from 'react';

// Joyride owns focus while it is open. Return to the existing entry control
// after finishing/skipping; never focus a control removed by navigation.
export default function useTourFocus(active, fallbackSelector) {
  const entry = useRef(null);
  const previouslyActive = useRef(false);
  const restoreRun = useRef(0);
  const fallback = useRef(fallbackSelector);
  fallback.current = fallbackSelector;
  if (active && !previouslyActive.current) {
    restoreRun.current += 1;
    entry.current = document.activeElement;
  }
  previouslyActive.current = active;

  const restoreFocus = useCallback(() => {
    const run = ++restoreRun.current;
    const original = entry.current;
    // Closing a tour can recreate its entry button in the same React update.
    // Wait for that update; do not retain or focus a detached DOM node.
    Promise.resolve().then(() => {
      if (run !== restoreRun.current) return;
      entry.current = null;
      const target = original && document.documentElement.contains(original)
        ? original : fallback.current && document.querySelector(fallback.current);
      if (target && !target.closest('[hidden],[inert],[aria-hidden="true"]') && target.focus) target.focus();
    });
  }, []);

  useEffect(() => {
    if (!active) restoreFocus();
  }, [active, restoreFocus]);
  useEffect(() => restoreFocus, [restoreFocus]);
  return restoreFocus;
}
