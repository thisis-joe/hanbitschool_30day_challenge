import { afterEach, expect, it, vi } from 'vitest';
import { requestId, sessionId } from '../../test/learningFixtures';
import type { PendingLearningCommand } from './types';
import {
  readPendingCommand,
  writePendingCommand,
  clearPendingCommand,
  clearAllPendingCommands,
} from './pendingCommands';

const command: PendingLearningCommand = {
  kind: 'ANSWER',
  sessionId,
  command: { requestId, questionId: 1, choice: 'O' },
};
const prefix = 'hanbit.learning.pending.v1:';
afterEach(() => {
  vi.restoreAllMocks();
  clearAllPendingCommands();
  sessionStorage.clear();
});

// Reading another student's slot or persisting feedback would leak private learning state.
it('pendingCommandsAreScopedToTheExactStudentAndStoreOnlyTheCommand', () => {
  writePendingCommand('student-a', command);
  expect(readPendingCommand('student-b')).toBeNull();
  expect(readPendingCommand('student-a')).toEqual(command);
  expect(JSON.parse(sessionStorage.getItem(prefix + 'student-a')!)).toEqual({
    kind: 'ANSWER',
    sessionId: '11111111-1111-4111-8111-111111111111',
    command: { requestId: '22222222-2222-4222-8222-222222222222', questionId: 1, choice: 'O' },
  });
  clearPendingCommand('student-a');
  expect(readPendingCommand('student-a')).toBeNull();
});

// Invalid UUIDs, mode payloads, out-of-range IDs, and extra private fields must never be replayed.
it.each([
  '{bad json',
  JSON.stringify({ ...command, sessionId: 'student-a' }),
  JSON.stringify({ ...command, command: { requestId: 'bad', questionId: 1, choice: 'O' } }),
  JSON.stringify({ ...command, command: { requestId, questionId: 151, choice: 'O' } }),
  JSON.stringify({ ...command, command: { requestId, questionId: 1, choice: 'Y' } }),
  JSON.stringify({ ...command, explanation: 'private' }),
  JSON.stringify({
    kind: 'START',
    command: { requestId, mode: 'REVIEW', dayNumber: 1, questionIds: [1] },
  }),
  JSON.stringify({
    kind: 'START',
    command: { requestId, mode: 'REVIEW', dayNumber: null, questionIds: [1, 1] },
  }),
  JSON.stringify({
    kind: 'START',
    command: { requestId, mode: 'FIRST', dayNumber: 0, questionIds: null },
  }),
  JSON.stringify({
    kind: 'START',
    command: { requestId, mode: 'REPLAY', dayNumber: 1, questionIds: [1] },
  }),
])('corruptPendingCommandsAreDiscardedInsteadOfReplayed: %s', (stored) => {
  sessionStorage.setItem(prefix + 'student-a', stored);
  expect(readPendingCommand('student-a')).toBeNull();
  expect(sessionStorage.getItem(prefix + 'student-a')).toBeNull();
});

// Both getter-denied storage and quota failures must preserve an uncertain command for an in-tab retry.
it.each(['SecurityError', 'QuotaExceededError'])(
  'blockedStorageRetainsAnInMemoryRetry: %s',
  (name) => {
    if (name === 'SecurityError')
      vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked', name);
      });
    else
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', name);
      });
    writePendingCommand('student-a', command);
    expect(readPendingCommand('student-a')).toEqual(command);
    clearPendingCommand('student-a');
    expect(readPendingCommand('student-a')).toBeNull();
  },
);

it('clearAllPendingCommandsClearsEveryOwnerWithoutDeletingOtherStorage', () => {
  writePendingCommand('student-a', command);
  writePendingCommand('student-b', command);
  expect(readPendingCommand('student-a')).toEqual(command);
  expect(readPendingCommand('student-b')).toEqual(command);
  sessionStorage.setItem('unrelated', 'keep');
  clearAllPendingCommands();
  expect(readPendingCommand('student-a')).toBeNull();
  expect(readPendingCommand('student-b')).toBeNull();
  expect(sessionStorage.getItem('unrelated')).toBe('keep');
});
