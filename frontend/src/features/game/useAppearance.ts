import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import {
  getPendingCommandEpoch,
  subscribePendingCommandCleanup,
} from '../learning/pendingCommands';
import { errorMessage, HttpError } from '../../lib/http';
import { getGame, saveAppearance } from './api';
import { gameKeys } from './queries';
import { SLOTS } from './types';
import type { AppearanceCommand, CharacterId, Equipment, GameView } from './types';

interface Flight {
  owner: string;
  epoch: number;
  controller: AbortController;
}
interface State {
  owner: string | undefined;
  epoch: number;
  busy: boolean;
  error: string | null;
}
const conflict = '다른 화면에서 외형이 변경되었어요. 현재 모습을 확인하고 다시 선택해 주세요.';
const matches = (view: GameView, command: AppearanceCommand) =>
  view.characterId === command.characterId &&
  SLOTS.every((slot) => view.equippedBySlot[slot] === command.equippedBySlot[slot]);

export function useAppearance(): {
  save(characterId: CharacterId | null, equipment: Equipment): Promise<boolean>;
  busy: boolean;
  error: string | null;
} {
  const client = useQueryClient();
  const { data: account } = useCurrentAccount();
  const owner = account?.role === 'STUDENT' ? account.accountId : undefined;
  const active = useRef<Flight | null>(null);
  const mounted = useRef(false);
  const [state, setState] = useState<State>(() => ({
    owner,
    epoch: getPendingCommandEpoch(),
    busy: false,
    error: null,
  }));
  useEffect(() => {
    mounted.current = true;
    const reset = () => {
      active.current?.controller.abort();
      active.current = null;
      setState({ owner, epoch: getPendingCommandEpoch(), busy: false, error: null });
    };
    reset();
    const unsubscribe = subscribePendingCommandCleanup(reset);
    return () => {
      mounted.current = false;
      unsubscribe();
      active.current?.controller.abort();
      active.current = null;
    };
  }, [owner]);

  function isCurrent(flight: Flight) {
    const current = client.getQueryData<AccountMe | null>(meKey);
    return (
      mounted.current &&
      active.current === flight &&
      !flight.controller.signal.aborted &&
      flight.epoch === getPendingCommandEpoch() &&
      current?.role === 'STUDENT' &&
      current.accountId === flight.owner
    );
  }
  async function save(characterId: CharacterId | null, equipment: Equipment): Promise<boolean> {
    // Serialize accepted intents: rapid repeats cannot issue a second PUT on an old revision.
    if (!owner || active.current || !mounted.current) return false;
    const key = gameKeys.view(owner);
    const before = client.getQueryData<GameView>(key);
    if (!before) return false;
    const command: AppearanceCommand = {
      characterId,
      expectedRevision: before.revision,
      equippedBySlot: {
        face: equipment.face,
        hat: equipment.hat,
        top: equipment.top,
        bottom: equipment.bottom,
        shoes: equipment.shoes,
        hand: equipment.hand,
      },
    };
    const flight: Flight = {
      owner,
      epoch: getPendingCommandEpoch(),
      controller: new AbortController(),
    };
    active.current = flight;
    if (!isCurrent(flight)) {
      active.current = null;
      return false;
    }
    setState({ owner, epoch: flight.epoch, busy: true, error: null });
    try {
      // An older query must not land after the accepted mutation/recovery.
      await client.cancelQueries({ queryKey: key, exact: true });
      if (!isCurrent(flight)) return false;
      let view: GameView;
      try {
        view = await saveAppearance(command, flight.controller.signal);
      } catch (cause) {
        if (!isCurrent(flight)) return false;
        const definiteRejection =
          cause instanceof HttpError &&
          cause.status >= 400 &&
          cause.status < 500 &&
          ![408, 409, 429].includes(cause.status) &&
          cause.body.code !== 'INVALID_CSRF_TOKEN';
        if (definiteRejection) throw cause;
        // A lost response may have committed. Recover with GET, never retry the PUT.
        view = await getGame(flight.controller.signal);
      }
      if (!isCurrent(flight)) return false;
      const cached = client.getQueryData<GameView>(key);
      const canonical = cached && cached.revision > view.revision ? cached : view;
      client.setQueryData(key, canonical);
      const accepted = matches(canonical, command);
      setState({ owner, epoch: flight.epoch, busy: false, error: accepted ? null : conflict });
      return accepted;
    } catch (cause) {
      if (isCurrent(flight))
        setState({ owner, epoch: flight.epoch, busy: false, error: errorMessage(cause) });
      return false;
    } finally {
      if (active.current === flight) active.current = null;
    }
  }
  const current = state.owner === owner && state.epoch === getPendingCommandEpoch();
  return { save, busy: current && state.busy, error: current ? state.error : null };
}
