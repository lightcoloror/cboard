import { createCareAiRequestJournal } from './careAiRequestJournal';

const input = {
  origin: 'https://api.example.test/api/',
  accountId: 'a',
  familyId: 'f',
  profileId: 'p',
  fundingId: 'fund',
  operation: 'communication-resegment',
  body: {
    text: '我不是不想吃饭',
    contractVersion: 2,
    pictogramVocabulary: ['吃饭']
  }
};
const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
};

test('retains identity across unknown, completed, reconstruction and lost metadata', () => {
  const storage = memory();
  const journal = createCareAiRequestJournal({ storage });
  const first = journal.prepare(input);
  expect(first.requestId).toMatch(/^cai_[a-f0-9]{64}$/);
  journal.observe(first, {});
  expect(journal.prepare(input).requestId).toBe(first.requestId);
  journal.observe(first, { status: 200 });
  expect(createCareAiRequestJournal({ storage }).prepare(input).requestId).toBe(
    first.requestId
  );
  storage.values.clear();
  expect(createCareAiRequestJournal({ storage }).prepare(input).requestId).toBe(
    first.requestId
  );
  expect([...storage.values.values()].join('')).not.toContain(input.body.text);
  expect([...storage.values.values()].join('')).not.toContain('example.test');
});

test('dictionary changes cannot turn the same text into a fresh paid request', () => {
  const storage = memory();
  const first = createCareAiRequestJournal({ storage }).prepare(input);
  const changed = {
    ...input,
    body: {
      ...input.body,
      pictogramVocabulary: ['吃饭', '回家'],
      unmatchedTokens: []
    }
  };
  for (const status of [undefined, 200]) {
    const journal = createCareAiRequestJournal({ storage });
    journal.observe(first, { status });
    expect(() => journal.prepare(changed)).toThrow(
      expect.objectContaining({ code: 'AI_REQUEST_INPUT_CHANGED' })
    );
    expect(journal.prepare(input).requestId).toBe(first.requestId);
  }
  // If metadata is lost, the same ID still reaches the server's complete-body
  // fingerprint guard; it cannot acquire a second reservation/provider call.
  storage.values.clear();
  expect(
    createCareAiRequestJournal({ storage }).prepare(changed).requestId
  ).toBe(first.requestId);
});

test('independent tabs with different dictionaries still share the same text intent', () => {
  const first = createCareAiRequestJournal({ storage: memory() }).prepare(
    input
  );
  const second = createCareAiRequestJournal({ storage: memory() }).prepare({
    ...input,
    body: { ...input.body, pictogramVocabulary: ['喝水'] }
  });
  expect(second.requestId).toBe(first.requestId);
  expect(second.fingerprint).not.toBe(first.fingerprint);
});

test('two independently created journals produce the same identity without cross-tab locking', () => {
  const a = createCareAiRequestJournal({ storage: memory() });
  const b = createCareAiRequestJournal({ storage: memory() });
  expect(a.prepare(input).requestId).toBe(
    b.prepare({
      ...input,
      body: {
        pictogramVocabulary: ['吃饭'],
        contractVersion: 2,
        text: input.body.text
      }
    }).requestId
  );
});

test.each([
  'origin',
  'accountId',
  'familyId',
  'profileId',
  'fundingId',
  'operation',
  'body'
])('isolates changed %s', field => {
  const journal = createCareAiRequestJournal({ storage: memory() });
  const value =
    field === 'body'
      ? { ...input.body, text: '我想吃饭' }
      : field === 'operation'
      ? 'communication-sentences'
      : `${input[field]}-changed`;
  expect(journal.prepare({ ...input, [field]: value }).requestId).not.toBe(
    journal.prepare(input).requestId
  );
});

test('preserves array order and repeated words in identity', () => {
  const journal = createCareAiRequestJournal({ storage: memory() });
  expect(
    journal.prepare({ ...input, body: { words: ['不', '不', '吃饭'] } })
      .requestId
  ).not.toBe(
    journal.prepare({ ...input, body: { words: ['不', '吃饭'] } }).requestId
  );
});

test('throws before sending on failed, silent, corrupt or mismatched storage', () => {
  for (const storage of [
    {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      }
    },
    { getItem: () => null, setItem: () => {} },
    { getItem: () => 'broken', setItem: () => {} },
    {
      getItem: () => JSON.stringify({ version: 1, requestId: 'other' }),
      setItem: () => {}
    }
  ]) {
    expect(() =>
      createCareAiRequestJournal({ storage }).prepare(input)
    ).toThrow('Unable to preserve');
  }
});
