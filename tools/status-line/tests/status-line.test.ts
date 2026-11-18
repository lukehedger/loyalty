import { describe, expect, test } from 'bun:test';
import {
  agentVersion,
  cacheHitRate,
  parseStatus,
  renderStatusLine,
} from '../status-line.ts';

// biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern matches ANSI escapes.
const plain = (line: string): string => line.replace(/\u001b\[[0-9;]*m/gu, '');

const assistant = (id: string, usage: Record<string, number>): string =>
  JSON.stringify({ message: { id, usage }, type: 'assistant' });

describe('parseStatus', () => {
  test('reads the fields Claude Code sends', () => {
    expect(
      parseStatus({
        agent: { name: 'wren' },
        context_window: { used_percentage: 41.9 },
        effort: { level: 'high' },
        model: { display_name: 'Opus 5.5' },
        transcript_path: '/tmp/session.jsonl',
        workspace: { current_dir: '/repo' },
      }),
    ).toEqual({
      agent: 'wren',
      contextPercentage: 41,
      cwd: '/repo',
      effort: 'high',
      model: 'Opus 5.5',
      transcriptPath: '/tmp/session.jsonl',
    });
  });

  test('strips the provider prefix and version suffix from the model', () => {
    expect(
      parseStatus({ model: { display_name: 'anthropic.claude-opus-5-5-v1' } })
        .model,
    ).toBe('opus-5-5');
  });

  test('survives input that is not an object', () => {
    expect(parseStatus(undefined)).toEqual({
      agent: undefined,
      contextPercentage: 0,
      cwd: undefined,
      effort: undefined,
      model: 'no model',
      transcriptPath: undefined,
    });
  });
});

describe('cacheHitRate', () => {
  test('counts each assistant message once', () => {
    const turn = assistant('a', {
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 80,
      input_tokens: 10,
    });

    expect(
      cacheHitRate([turn, turn, '{not json', '{"type":"user"}'].join('\n')),
    ).toBe(80);
  });

  test('has no rate before any usage lands', () => {
    expect(cacheHitRate('')).toBeUndefined();
  });
});

describe('agentVersion', () => {
  test('reads the version from the agent frontmatter', () => {
    expect(
      agentVersion('---\nname: wren\nversion: 1\n---\n\nYou are wren.'),
    ).toBe('1');
  });

  test('has no version when the frontmatter declares none', () => {
    expect(agentVersion('---\nname: wren\n---\n\nversion: 9')).toBeUndefined();
  });
});

describe('renderStatusLine', () => {
  test('renders every segment with the agent chip last', () => {
    expect(
      plain(
        renderStatusLine({
          agent: 'wren',
          agentVersion: '1',
          branch: 'main',
          cacheHitRate: 93.4,
          contextPercentage: 41,
          effort: 'high',
          model: 'Opus 5.5',
          worktree: 'feature',
        }),
      ),
    ).toBe('Opus 5.5 | high | 41% | 93%↺ | ⎇ main | ⌥ feature  wren v1 ');
  });

  test('leaves out what it does not know', () => {
    expect(
      plain(renderStatusLine({ contextPercentage: 0, model: 'Opus 5.5' })),
    ).toBe('Opus 5.5 | 0%');
  });
});
