import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/assessment/[id]/route';
import { POST as feedback } from '../app/api/assessment/[id]/feedback/route';
import { chatModelId, streamReply } from './llm';
import { newAssessment, type Ratings } from './secondary';
import { insertAssessment, readAssessment } from './store';
import { evidenceVersion } from './assessment-scoring';

vi.mock('./llm', () => ({ chatModelId: vi.fn(() => 'test-model'), streamReply: vi.fn() }));

const stream = vi.mocked(streamReply);
vi.stubEnv('DB_PATH', ':memory:');
// One assessor run per report keeps each mocked provider reply aligned with one request.
vi.stubEnv('ASSESSOR_RUNS', '1');
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (action: string, text: string, version = 0, work = '') =>
  new Request('http://localhost/api/assessment/test', { method: 'POST', body: JSON.stringify({ action, text, version, work }) });

afterEach(() => stream.mockReset());

describe.each([
  { stage: 'revision', history: 'discussion', other: 'comparison', windPack: 2, system: 'Dramatic', scienceThinking: false },
  { stage: 'science', history: 'comparison', other: 'discussion', windPack: 2, system: 'original public station log', scienceThinking: true },
  { stage: 'science', history: 'comparison', other: 'discussion', windPack: undefined, system: 'wind-speed graphs', scienceThinking: false },
] as const)('$stage chat with wind pack $windPack', ({ stage, history, other, windPack, system, scienceThinking }) => {
  it('does not save a partial reply, then saves one complete exchange on retry', async () => {
    const id = insertAssessment({ ...newAssessment(), stage, windPack, draft: 'Original argument.' });
    stream.mockImplementationOnce(async function* () {
      yield 'Provider partial output';
      return { error: 'Try sending your message again.' };
    }).mockImplementationOnce(async function* () {
      yield 'Check the evidence.';
      return { model: 'test-model' };
    });
    const message = 'Can you check my reasoning?';
    const failure = await POST(request('chat', message, 0, 'Current work.'), ctx(id));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ error: 'Try sending your message again.' });
    expect(readAssessment(id)).toMatchObject({ version: 0, [history]: [], [other]: [] });
    const success = await POST(request('chat', message, 0, 'Current work.'), ctx(id));
    expect(success.status).toBe(200);
    const body = await success.json();
    expect(body).toMatchObject({ version: 1, chatModel: 'test-model', [history]: [
      { role: 'user', text: message }, { role: 'assistant', text: 'Check the evidence.', model: 'test-model' },
    ], [other]: [] });
    expect(stream.mock.calls[1][0][0].text).toContain('Current work.');
    expect(stream.mock.calls[1][0][0].text.includes('Original argument.')).toBe(stage === 'revision');
    expect(String(stream.mock.calls[1][1]).toLowerCase()).toContain(system.toLowerCase());
    expect(stream.mock.calls[1][2]).toEqual(scienceThinking ? { thinking: 'low', maxTokens: 16000 } : {});
    expect(String(stream.mock.calls[1][1])).toContain('AI learning collaborator');
    expect((await GET(request('chat', message), ctx(id))).status).toBe(200);
    expect((await POST(request('chat', message), ctx(id))).status).toBe(409);
    expect(stream).toHaveBeenCalledTimes(2);
  });
});

it('blocks an overlapping request, hides thrown details and releases the lock', async () => {
  const id = insertAssessment({ ...newAssessment(), stage: 'science', windPack: undefined });
  let started!: () => void;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  stream.mockImplementationOnce(async function* () {
    started();
    await waiting;
    throw Error('Private provider payload');
  }).mockImplementationOnce(async function* () {
    yield 'Compare the sites.';
    return { model: 'test-model' };
  });
  const pending = POST(request('chat', 'What should I compare?'), ctx(id));
  await ready;
  expect((await POST(request('submit', 'My recommendation.'), ctx(id))).status).toBe(409);
  release();
  const failure = await pending;
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain('Private provider payload');
  expect((await POST(request('chat', 'What should I compare?'), ctx(id))).status).toBe(200);
});

it('preserves task transitions and requires an explicit request to regenerate saved feedback', async () => {
  const id = insertAssessment({ ...newAssessment(), windPack: undefined });
  expect((await POST(request('chat', 'Help'), ctx(id))).status).toBe(409);
  for (const [version, stage] of ['revision', 'science', 'feedback'].entries()) {
    const response = await POST(request('submit', 'Submission ' + version, version), ctx(id));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stage, version: version + 1 });
  }
  const data = readAssessment(id)!;
  const legacy = { effective: { level: 'Great', comment: 'Previously saved feedback.' } } as Ratings;
  const legacyId = insertAssessment({ ...data, ratings: legacy });
  const regenerate = () => new Request('http://localhost/feedback', {
    method: 'POST', body: JSON.stringify({ regenerate: true }),
  });
  expect((await feedback(request('', ''), ctx(legacyId))).status).toBe(409);
  expect(stream).not.toHaveBeenCalled();
  stream.mockImplementationOnce(async function* () { return { error: 'Provider unavailable' }; });
  expect((await feedback(regenerate(), ctx(legacyId))).status).toBe(503);
  expect(readAssessment(legacyId)?.ratings).toEqual(legacy);

  const gap = { sourceId: '', quote: '', firstDraftQuote: '', outcome: 'insufficient', reason: 'No example.', improvement: 'Give an example.' };
  const rows = [{ ...gap, task: 'essay' }, { ...gap, task: 'science' }];
  stream.mockImplementationOnce(async function* () {
    yield JSON.stringify({ effective: rows, critical: rows, responsible: rows, bonus: rows });
    return { model: 'test-model' };
  });
  const response = await feedback(regenerate(), ctx(legacyId));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.schema).toBe(evidenceVersion);
  expect(readAssessment(legacyId)).toMatchObject({ feedback: result, ratings: legacy });
  expect(await (await feedback(request('', ''), ctx(legacyId))).json()).toEqual(result);
  expect(stream).toHaveBeenCalledTimes(2);
  expect(chatModelId()).toBe('test-model');

  const previous = { ...result, schema: 1 as const };
  const previousId = insertAssessment({ ...data, feedback: previous });
  const savedVersion = await feedback(request('', ''), ctx(previousId));
  expect(await savedVersion.json()).toEqual(previous);
  expect(stream).toHaveBeenCalledTimes(2);
});

it('requests the flat feedback schema and can retry when a provider returns grouped task objects', async () => {
  const id = insertAssessment({ ...newAssessment(), stage: 'feedback', revision: 'Saved essay.' });
  const gap = { sourceId: '', quote: '', firstDraftQuote: '', outcome: 'insufficient', reason: 'No example.', improvement: 'Give an example.' };
  const grouped = { essay: [gap], science: [gap] };
  const rows = [{ ...gap, task: 'essay' }, { ...gap, task: 'science' }];
  stream.mockImplementationOnce(async function* () {
    yield JSON.stringify({ effective: grouped, critical: grouped, responsible: grouped, bonus: grouped });
    return { model: 'test-model' };
  }).mockImplementationOnce(async function* () {
    yield JSON.stringify({ effective: rows, critical: rows, responsible: rows, bonus: rows });
    return { model: 'test-model' };
  });

  expect((await feedback(request('', ''), ctx(id))).status).toBe(503);
  expect(readAssessment(id)).toMatchObject({ version: 0, revision: 'Saved essay.' });
  expect((await feedback(request('', ''), ctx(id))).status).toBe(200);
  expect(readAssessment(id)?.feedback?.schema).toBe(evidenceVersion);
  expect(stream.mock.calls[1][2]?.format).toMatchObject({
    type: 'json_schema',
    schema: {
      required: ['effective', 'critical', 'responsible', 'bonus'],
      properties: {
        critical: { type: 'array', items: { properties: { task: { enum: ['essay', 'science'] } } } },
        responsible: { type: 'array', items: { required: expect.arrayContaining(['verification']) } },
      },
    },
  });
});

it('requests three independent reviews by default and keeps the report when one fails', async () => {
  vi.stubEnv('ASSESSOR_RUNS', '');
  try {
    const id = insertAssessment({ ...newAssessment(), stage: 'feedback', revision: 'Saved essay.' });
    const gap = { sourceId: '', quote: '', firstDraftQuote: '', outcome: 'insufficient', reason: 'No example.', improvement: 'Give an example.' };
    const rows = [{ ...gap, task: 'essay' }, { ...gap, task: 'science' }];
    const reply = async function* () {
      yield JSON.stringify({ effective: rows, critical: rows, responsible: rows, bonus: rows });
      return { model: 'test-model' };
    };
    stream.mockImplementationOnce(reply)
      .mockImplementationOnce(async function* () { return { error: 'Provider unavailable' }; })
      .mockImplementationOnce(reply);
    const response = await feedback(request('', ''), ctx(id));
    expect(response.status).toBe(200);
    expect(stream).toHaveBeenCalledTimes(3);
    expect(await response.json()).toMatchObject({ schema: evidenceVersion, runs: { requested: 3, valid: 2 } });
  } finally {
    vi.stubEnv('ASSESSOR_RUNS', '1');
  }
});
