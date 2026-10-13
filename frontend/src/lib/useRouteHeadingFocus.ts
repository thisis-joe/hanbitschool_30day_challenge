import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Search/filter changes and refreshed data are not a new page identity.
export function useRouteHeadingFocus(owner: string | undefined, ready: boolean, modalOpen = false) {
  const { pathname } = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const entry = useRef<{ owner: string | undefined; pathname: string; handled: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!entry.current || entry.current.owner !== owner || entry.current.pathname !== pathname) {
      entry.current = { owner, pathname, handled: false };
    }
    if (!owner || !ready || entry.current.handled) return;
    // The dialog owns focus on direct modal entry; closing restores its trigger.
    entry.current.handled = true;
    if (!modalOpen) heading.current?.focus();
  }, [owner, pathname, ready, modalOpen]);
  return heading;
}
