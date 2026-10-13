import type { PendingLearningCommand } from './types';

const prefix = 'hanbit.learning.pending.v1:';
const fallback = new Map<string, string | null>();
const cleanupListeners = new Set<() => void>();
let accountEpoch = 0;
let ignoreStoredCommands = false;
const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const questionId = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 150;

function valid(value: unknown): value is PendingLearningCommand {
  if (!record(value) || !record(value.command) || !uuid(value.command.requestId)) return false;
  const command = value.command;
  if (value.kind === 'START') {
    if (
      !keysAre(value, ['kind', 'command']) ||
      !keysAre(command, ['requestId', 'mode', 'dayNumber', 'questionIds'])
    )
      return false;
    if (command.mode === 'REVIEW') {
      return (
        command.dayNumber === null &&
        Array.isArray(command.questionIds) &&
        command.questionIds.length > 0 &&
        command.questionIds.length <= 150 &&
        command.questionIds.every(questionId) &&
        new Set(command.questionIds).size === command.questionIds.length
      );
    }
    return (
      (command.mode === 'FIRST' || command.mode === 'REPLAY') &&
      typeof command.dayNumber === 'number' &&
      Number.isInteger(command.dayNumber) &&
      command.dayNumber >= 1 &&
      command.dayNumber <= 30 &&
      (command.questionIds === null ||
        (Array.isArray(command.questionIds) && command.questionIds.length === 0))
    );
  }
  if (!keysAre(value, ['kind', 'sessionId', 'command']) || !uuid(value.sessionId)) return false;
  if (value.kind === 'ANSWER')
    return (
      keysAre(command, ['requestId', 'questionId', 'choice']) &&
      questionId(command.questionId) &&
      (command.choice === 'O' || command.choice === 'X')
    );
  return value.kind === 'ADVANCE' && keysAre(command, ['requestId']);
}

export function readPendingCommand(accountId: string): PendingLearningCommand | null {
  let stored = fallback.get(accountId);
  if (!fallback.has(accountId) && !ignoreStoredCommands) {
    try {
      stored = window.sessionStorage.getItem(prefix + accountId);
    } catch {
      return null;
    }
  }
  if (!stored) return null;
  try {
    const command: unknown = JSON.parse(stored);
    if (valid(command)) return command;
  } catch {
    /* A malformed slot must not block canonical GET recovery. */
  }
  clearPendingCommand(accountId);
  return null;
}

export function writePendingCommand(accountId: string, command: PendingLearningCommand): void {
  if (!valid(command)) return;
  const stored = JSON.stringify(command);
  fallback.set(accountId, stored);
  try {
    window.sessionStorage.setItem(prefix + accountId, stored);
  } catch {
    /* Keep the same command in this tab. */
  }
}

export function clearPendingCommand(accountId: string): void {
  // The tombstone prevents a failed removeItem from resurrecting an old command.
  fallback.set(accountId, null);
  try {
    window.sessionStorage.removeItem(prefix + accountId);
  } catch {
    /* The in-memory tombstone is authoritative. */
  }
}

export function clearPendingCommandStorage(): void {
  fallback.clear();
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) storage.removeItem(key);
    }
    ignoreStoredCommands = false;
  } catch {
    ignoreStoredCommands = true;
  }
}

export function clearAllPendingCommands(): void {
  accountEpoch++;
  clearPendingCommandStorage();
  for (const listener of cleanupListeners) listener();
}

export function getPendingCommandEpoch(): number {
  return accountEpoch;
}
export function subscribePendingCommandCleanup(listener: () => void): () => void {
  cleanupListeners.add(listener);
  return () => {
    cleanupListeners.delete(listener);
  };
}
