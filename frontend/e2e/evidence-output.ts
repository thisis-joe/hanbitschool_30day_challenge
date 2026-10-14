import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface EvidenceRun {
  file: (name: string) => string;
}
interface EvidenceConfig {
  plan?: string;
  run?: string;
}

function directoryState(path: string) {
  const state = lstatSync(path, { throwIfNoEntry: false });
  if (state && (!state.isDirectory() || state.isSymbolicLink()))
    throw new Error('Evidence directory must not be a file or symlink');
  return state;
}

/** The root is injected only for filesystem tests; browser callers use this module's checkout. */
export function createEvidenceRun(
  worktreeRoot: string,
  config: EvidenceConfig,
): EvidenceRun | undefined {
  if (config.plan === undefined && config.run === undefined) return undefined;
  for (const value of [config.plan, config.run]) {
    if (
      !value ||
      value.length > 100 ||
      /[^a-z0-9-]/.test(value) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    )
      throw new Error('Evidence capture requires safe plan and unique run identifiers');
  }
  const root = realpathSync(worktreeRoot);
  const ancestors: string[] = [];
  let current = root;
  for (const segment of ['.superpowers', 'sdd', config.plan!, 'evidence', config.run!]) {
    current = join(current, segment);
    ancestors.push(current);
  }
  // Validate every existing component BEFORE creating anything. Never reuse an old run.
  ancestors.forEach(directoryState);
  if (directoryState(current))
    throw new Error('Evidence run already exists; choose a new run identifier');
  for (const directory of ancestors.slice(0, -1)) {
    if (!directoryState(directory)) mkdirSync(directory, { mode: 0o700 });
  }
  // Exclusive creation also rejects a simultaneous process trying to claim this run.
  mkdirSync(current, { mode: 0o700 });
  return {
    file(name) {
      if (!/^[a-z0-9][a-z0-9.-]*\.(png|jsonl)$/.test(name) || /[^a-z0-9.-]/.test(name))
        throw new Error('Evidence filename must be a local PNG or JSONL leaf');
      for (const directory of ancestors)
        if (!directoryState(directory)) throw new Error('Evidence run directory disappeared');
      const path = join(current, name);
      const state = lstatSync(path, { throwIfNoEntry: false });
      if (state && (!state.isFile() || state.isSymbolicLink()))
        throw new Error('Evidence artifact must not be a symlink or directory');
      return path;
    },
  };
}

let initialized = false;
let output: EvidenceRun | undefined;

/** No imports of account credentials, canonical questions, or any predecessor plan. */
export function evidenceOutput(): EvidenceRun | undefined {
  if (!initialized) {
    output = createEvidenceRun(fileURLToPath(new URL('../../', import.meta.url)), {
      plan: process.env.HANBIT_E2E_EVIDENCE_PLAN,
      run: process.env.HANBIT_E2E_EVIDENCE_RUN,
    });
    initialized = true;
  }
  return output;
}
