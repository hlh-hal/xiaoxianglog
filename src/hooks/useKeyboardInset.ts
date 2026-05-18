import { useState, useEffect, useRef } from 'react';

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  const initialInnerHeight = useRef(0);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    // Capture the initial layout viewport height (before any keyboard opens).
    // On Android with interactive-widget=resizes-content, window.innerHeight
    // shrinks when the keyboard opens, so we can detect that the browser is
    // already handling the inset for us.
    initialInnerHeight.current = window.innerHeight;

    const updateInset = () => {
      const vvHeight = visualViewport.height;
      const layoutHeight = window.innerHeight;

      // If the layout viewport itself has shrunk compared to the initial height,
      // the browser is using resizes-content mode (Android Chrome 108+).
      // In that case, position:fixed bottom:0 already sits above the keyboard,
      // so we should NOT add extra translateY offset.
      const layoutShrunk = initialInnerHeight.current - layoutHeight;
      if (layoutShrunk > 50) {
        // Layout viewport already accounts for the keyboard
        setInset(0);
        return;
      }

      // iOS Safari path: layout viewport stays full-screen, only visual viewport shrinks.
      const keyboardHeight = layoutHeight - vvHeight;
      setInset(Math.max(0, keyboardHeight));
    };

    visualViewport.addEventListener('resize', updateInset);
    visualViewport.addEventListener('scroll', updateInset);

    // Also listen to window resize to catch layout viewport changes (Android)
    window.addEventListener('resize', updateInset);

    // Initial calculation
    updateInset();

    return () => {
      visualViewport.removeEventListener('resize', updateInset);
      visualViewport.removeEventListener('scroll', updateInset);
      window.removeEventListener('resize', updateInset);
    };
  }, []);

  return inset;
}
