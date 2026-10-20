import { useCallback, useState } from 'react';

export const acquisitionDuration = { xp: 2600, item: 4400 } as const;
export const inlineAcquisitionDuration = 2400;

/** The full-screen reveal hands off to the persistent reward card. */
export function useAcquisitionSequence(active: boolean, identity: string) {
  const [finished, setFinished] = useState<string | null>(null);
  const complete = useCallback(() => setFinished(identity), [identity]);
  const cinematic = active && finished !== identity;
  return { cinematic, inline: active && !cinematic, complete };
}
