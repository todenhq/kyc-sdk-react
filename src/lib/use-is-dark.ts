import { useEffect, useState } from 'react';
import { themeRootOrDocument, useThemeRoot } from './sdk-frame-context';

/**
 * Tracks the SDK's dark class, reactively.
 *
 * The theme toggle flips `.dark` on the THEME ROOT — the SdkFrame's shadow
 * portal frame when the mount is isolated, else `documentElement` (hosted
 * page) — and re-renders ITSELF, so anything computing styles from the theme
 * higher up the tree never heard about it. That was fine while dark mode was
 * pure CSS — but org colours are applied as INLINE custom properties, and an
 * inline style beats the `.dark .verification-root` rules, so a branded flow kept its
 * light background after toggling to dark. Observing the class is what lets
 * the dark palette be swapped in on toggle.
 */
export function useIsDark(): boolean {
  const themeRoot = useThemeRoot();
  const [isDark, setIsDark] = useState(
    () => themeRootOrDocument(themeRoot)?.classList.contains('dark') ?? false,
  );

  useEffect(() => {
    const root = themeRootOrDocument(themeRoot);
    if (!root) return;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [themeRoot]);

  return isDark;
}
