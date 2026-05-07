import { useState, useEffect } from 'react';

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateInset = () => {
      // Calculate the difference between the layout viewport and the visual viewport.
      // On iOS Safari, when the keyboard opens, visualViewport.height shrinks.
      const keyboardHeight = window.innerHeight - visualViewport.height;
      setInset(Math.max(0, keyboardHeight));
    };

    visualViewport.addEventListener('resize', updateInset);
    visualViewport.addEventListener('scroll', updateInset);
    
    // Initial calculation
    updateInset();

    return () => {
      visualViewport.removeEventListener('resize', updateInset);
      visualViewport.removeEventListener('scroll', updateInset);
    };
  }, []);

  return inset;
}
