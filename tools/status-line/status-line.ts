export type Status = {
  readonly agent?: string;
  readonly contextPercentage: number;
  readonly cwd?: string;
  readonly effort?: string;
  readonly model: string;
  readonly transcriptPath?: string;
};

export type Repository = {
  readonly branch?: string;
  readonly worktree?: string;
};

export type StatusLine = Status &
  Repository & {
    readonly agentVersion?: string;
    readonly cacheHitRate?: number;
  };

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

const foreground = (red: number, green: number, blue: number): string =>
  `\u001b[38;2;${red};${green};${blue}m`;

const background = (red: number, green: number, blue: number): string =>
  `\u001b[48;2;${red};${green};${blue}m`;

// Purple to pink to blue, dark to light across the segments.
const COLOURS = {
  agent: `${BOLD}${foreground(243, 139, 168)}${background(48, 56, 74)}`,
  branch: foreground(186, 230, 253),
  cache: foreground(125, 211, 252),
  context: foreground(244, 114, 182),
  effort: foreground(217, 70, 239),
  model: `${foreground(139, 92, 246)}${BOLD}`,
  worktree: foreground(224, 242, 254),
} as const;

const SEPARATOR = ` ${DIM}|${RESET} `;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const field = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) => (isRecord(current) ? current[key] : undefined),
    value,
  );

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const parseStatus = (input: unknown): Status => ({
  agent: text(field(input, 'agent', 'name')),
  contextPercentage: Math.floor(
    count(field(input, 'context_window', 'used_percentage')),
  ),
  cwd:
    text(field(input, 'workspace', 'current_dir')) ?? text(field(input, 'cwd')),
  effort: text(field(input, 'effort', 'level')),
  model: (text(field(input, 'model', 'display_name')) ?? 'no model')
    .replace(/^anthropic\.claude-/u, '')
    .replace(/-v\d+$/u, ''),
  transcriptPath: text(field(input, 'transcript_path')),
});

/** The share of input the prompt cache served across the session, deduplicated by message id because a resumed transcript replays earlier messages. */
export const cacheHitRate = (transcript: string): number | undefined => {
  const usageById = new Map<string, unknown>();
  for (const line of transcript.split('\n')) {
    const entry = ((): unknown => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })();
    const id = text(field(entry, 'message', 'id'));
    const usage = field(entry, 'message', 'usage');
    if (field(entry, 'type') === 'assistant' && id && isRecord(usage)) {
      usageById.set(id, usage);
    }
  }
  const totals = [...usageById.values()].reduce<{
    readonly read: number;
    readonly total: number;
  }>(
    (sum, usage) => {
      const read = count(field(usage, 'cache_read_input_tokens'));
      return {
        read: sum.read + read,
        total:
          sum.total +
          read +
          count(field(usage, 'input_tokens')) +
          count(field(usage, 'cache_creation_input_tokens')),
      };
    },
    { read: 0, total: 0 },
  );
  return totals.total === 0 ? undefined : (100 * totals.read) / totals.total;
};

export const agentVersion = (definition: string): string | undefined => {
  const frontmatter = /^---\n(?<body>[\s\S]*?)\n---/u.exec(definition)?.groups
    ?.body;
  return /^version:\s*(?<version>\S+)\s*$/mu.exec(frontmatter ?? '')?.groups
    ?.version;
};

const paint = (colour: string, value: string): string =>
  `${colour}${value}${RESET}`;

export const renderStatusLine = (line: StatusLine): string => {
  const segments = [
    paint(COLOURS.model, line.model),
    line.effort === undefined ? undefined : paint(COLOURS.effort, line.effort),
    paint(COLOURS.context, `${line.contextPercentage}%`),
    line.cacheHitRate === undefined
      ? undefined
      : paint(COLOURS.cache, `${Math.round(line.cacheHitRate)}%↺`),
    line.branch === undefined
      ? undefined
      : paint(COLOURS.branch, `⎇ ${line.branch}`),
    line.worktree === undefined
      ? undefined
      : paint(COLOURS.worktree, `⌥ ${line.worktree}`),
  ].filter((segment) => segment !== undefined);

  const chip =
    line.agent === undefined
      ? ''
      : ` ${paint(COLOURS.agent, ` ${line.agent}${line.agentVersion === undefined ? '' : ` v${line.agentVersion}`} `)}`;

  return `${segments.join(SEPARATOR)}${chip}`;
};
