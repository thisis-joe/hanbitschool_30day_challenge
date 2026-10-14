import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meKey } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { getPendingCommandEpoch } from '../learning/pendingCommands';

type Seen = Record<string, boolean>;

/** Cosmetic false -> true events, consumed once across route remounts in this account session. */
export function useSeenTransition(
  owner: string | undefined,
  contentVersion: string,
  surface: string,
  observations: Seen,
) {
  const client = useQueryClient();
  const identity = JSON.stringify([owner, contentVersion, surface]);
  const snapshot = JSON.stringify(observations);
  const epoch = getPendingCommandEpoch();
  const [event, setEvent] = useState<{ identity: string; keys: string[]; epoch: number } | null>(
    null,
  );

  useEffect(() => {
    setEvent((previous) =>
      previous?.identity === identity && previous.epoch === epoch ? previous : null,
    );
  }, [identity, epoch]);

  useEffect(() => {
    const account = client.getQueryData<AccountMe | null>(meKey);
    if (
      !owner ||
      account?.role !== 'STUDENT' ||
      account.accountId !== owner ||
      epoch !== getPendingCommandEpoch()
    )
      return;
    const key = ['cosmetic-seen', owner, contentVersion, surface];
    const current = JSON.parse(snapshot) as Seen;
    const previous = client.getQueryData<Seen>(key);
    const newlySeen = Object.keys(current).filter((id) => current[id] && previous?.[id] === false);
    const merged = { ...previous };
    // Preserve prior true observations even when a later stale snapshot is false.
    for (const id of Object.keys(current)) merged[id] = !!previous?.[id] || current[id];
    client.setQueryDefaults(['cosmetic-seen'], { gcTime: Infinity });
    client.setQueryData(key, merged);
    if (newlySeen.length && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setEvent({ identity, keys: newlySeen, epoch });
    }
    return client.getQueryCache().subscribe((change) => {
      if (change.type === 'removed' && change.query.queryKey[0] === 'cosmetic-seen') setEvent(null);
    });
  }, [client, owner, contentVersion, surface, identity, snapshot, epoch]);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => setEvent(null), 900);
    return () => window.clearTimeout(timer);
  }, [event]);

  const account = client.getQueryData<AccountMe | null>(meKey);
  return event?.identity === identity && event.epoch === epoch && account?.accountId === owner
    ? event.keys
    : [];
}
