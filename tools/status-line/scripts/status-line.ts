import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  agentVersion,
  cacheHitRate,
  parseStatus,
  type Repository,
  renderStatusLine,
} from '../status-line.ts';

const git = (cwd: string, ...args: readonly string[]): string | undefined => {
  try {
    const output = execFileSync(
      'git',
      ['-C', cwd, '--no-optional-locks', ...args],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
      },
    ).trim();
    return output === '' ? undefined : output;
  } catch {
    return undefined;
  }
};

// A linked worktree has its own git dir, distinct from the repository's common git dir.
const repository = (cwd: string | undefined): Repository => {
  if (cwd === undefined) return {};
  const [toplevel, gitDir, commonDir] = (
    git(
      cwd,
      'rev-parse',
      '--show-toplevel',
      '--absolute-git-dir',
      '--git-common-dir',
    ) ?? ''
  ).split('\n');
  if (
    toplevel === undefined ||
    gitDir === undefined ||
    commonDir === undefined
  ) {
    return {};
  }
  return {
    branch:
      git(cwd, 'branch', '--show-current') ??
      git(cwd, 'rev-parse', '--short', 'HEAD'),
    worktree:
      resolve(toplevel, commonDir) === resolve(gitDir)
        ? undefined
        : basename(toplevel),
  };
};

const readOptional = (path: string | undefined): Promise<string | undefined> =>
  path === undefined
    ? Promise.resolve(undefined)
    : readFile(path, 'utf8').catch(() => undefined);

const status = parseStatus(
  await Bun.stdin
    .text()
    .then((input) => JSON.parse(input))
    .catch(() => undefined),
);
const root = join(import.meta.dirname, '../../..');
const [transcript, definition] = await Promise.all([
  readOptional(status.transcriptPath),
  readOptional(
    status.agent === undefined
      ? undefined
      : join(root, '.claude/agents', `${status.agent}.md`),
  ),
]);

process.stdout.write(
  renderStatusLine({
    ...status,
    ...repository(status.cwd),
    agentVersion:
      definition === undefined ? undefined : agentVersion(definition),
    cacheHitRate:
      transcript === undefined ? undefined : cacheHitRate(transcript),
  }),
);
