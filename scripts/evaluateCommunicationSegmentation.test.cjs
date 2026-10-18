'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const evaluation = require('./evaluateCommunicationSegmentation.cjs');
const core = evaluation.loadCore();
const cases = evaluation.checkCorpus(evaluation.corpus);
const env = {
  CBOARD_API_BASE_URL: 'https://synthetic.invalid/api',
  RESEGMENT_EVAL_TOKEN: 'synthetic-secret-never-report',
  RESEGMENT_EVAL_PROFILE_ID: 'synthetic-profile',
  RESEGMENT_EVAL_FUNDING_ID: 'synthetic-funding'
};

test('checked-in references reconstruct all 20 synthetic sources in the actual core', () => {
  const results = evaluation.evaluateLocal(core, cases);
  assert.equal(results.length, 20);
  assert.ok(results.every(item => item.sourcePreserved));
  assert.ok(results.every(item => item.requiresHumanSemanticReview));
  assert.ok(
    results
      .find(item => item.id === 'double-negative')
      .imageMatches.every(item => item.sourceToken && item.imageLabel)
  );
});

test('invalid reference types, source changes and duplicate ids are rejected', () => {
  for (const value of [
    null,
    { evidenceType: 'real-data', cases },
    { evidenceType: 'synthetic-engineering-corpus', cases: [] }
  ]) {
    assert.throws(() => evaluation.checkCorpus(value));
  }
  for (const referenceTokens of [[], [123], [''], ['changed']]) {
    assert.throws(() =>
      evaluation.checkCorpus({
        ...evaluation.corpus,
        cases: [{ ...cases[0], referenceTokens }]
      })
    );
  }
  assert.throws(() =>
    evaluation.checkCorpus({
      ...evaluation.corpus,
      cases: [cases[0], cases[0]]
    })
  );
});

test('boundary comparison uses code points and distinguishes over/under segmentation', () => {
  assert.deepEqual(evaluation.boundaryScore(['🙂', '水'], ['🙂', '水']), {
    precision: 1,
    recall: 1,
    f1: 1
  });
  assert.deepEqual(evaluation.boundaryScore(['喝水'], ['喝', '水']), {
    precision: 0,
    recall: 0,
    f1: 0
  });
  assert.equal(
    evaluation.boundaryScore(['我', '喝', '水'], ['我', '喝水']).precision,
    0.5
  );
});

test('live endpoint permits HTTPS or loopback HTTP only, without URL credentials', () => {
  assert.equal(
    evaluation.makeEndpoint('https://synthetic.invalid/api/'),
    'https://synthetic.invalid/api/gpt/communication/resegment'
  );
  assert.match(evaluation.makeEndpoint('http://127.0.0.1:8080'), /^http:/);
  for (const value of [
    'http://synthetic.invalid',
    'https://user:secret@synthetic.invalid',
    'https://synthetic.invalid/?key=secret',
    'https://synthetic.invalid/#secret'
  ]) {
    assert.throws(() => evaluation.makeEndpoint(value));
  }
});

test('missing authenticated funding configuration cannot invoke the network', async () => {
  const result = await evaluation.collectLive(core, cases.slice(0, 1), {}, () =>
    assert.fail('unexpected fetch')
  );
  assert.equal(result.status, 'blocked');
  assert.equal(result.requestCount, 0);
});

test('live mode reuses authenticated quota headers and preserves exact model tokens', async () => {
  const keys = new Set();
  let calls = 0;
  const result = await evaluation.collectLive(
    core,
    cases.slice(0, 2),
    env,
    async (url, options) => {
      const item = cases[calls++];
      assert.equal(
        url,
        'https://synthetic.invalid/api/gpt/communication/resegment'
      );
      assert.equal(options.redirect, 'error');
      assert.equal(
        options.headers.Authorization,
        `Bearer ${env.RESEGMENT_EVAL_TOKEN}`
      );
      assert.equal(
        options.headers['X-Care-Profile-Id'],
        env.RESEGMENT_EVAL_PROFILE_ID
      );
      assert.equal(
        options.headers['X-Care-Funding-Id'],
        env.RESEGMENT_EVAL_FUNDING_ID
      );
      assert.equal(JSON.parse(options.body).text, item.text);
      keys.add(options.headers['Idempotency-Key']);
      return {
        ok: true,
        headers: { get: () => 'synthetic-ledger-receipt' },
        json: async () => ({ tokens: item.referenceTokens })
      };
    }
  );
  assert.equal(calls, 2);
  assert.equal(keys.size, 2);
  assert.equal(result.status, 'completed');
  assert.ok(
    result.results.every(item => item.accepted && item.sourcePreserved)
  );
  assert.equal(result.actualCost, null);
  assert.ok(!JSON.stringify(result).includes(env.RESEGMENT_EVAL_TOKEN));
});

for (const [name, response] of [
  [
    'quota denied',
    async () => ({
      ok: false,
      status: 403,
      json: async () => ({ secret: env.RESEGMENT_EVAL_TOKEN })
    })
  ],
  [
    'source changed',
    async () => ({ ok: true, json: async () => ({ tokens: ['changed'] }) })
  ],
  [
    'response error',
    async () => {
      throw new Error(env.RESEGMENT_EVAL_TOKEN);
    }
  ]
]) {
  test(`stops after ${name} without retries or sensitive error output`, async () => {
    let calls = 0;
    const result = await evaluation.collectLive(
      core,
      cases.slice(0, 3),
      env,
      async () => {
        calls++;
        return response();
      }
    );
    assert.equal(calls, 1);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.requestCount, 1);
    assert.ok(!JSON.stringify(result).includes(env.RESEGMENT_EVAL_TOKEN));
    assert.ok(!JSON.stringify(result).includes('changed'));
  });
}

test('CLI defaults offline and rejects unbounded live batch arguments', () => {
  assert.equal(evaluation.parseArgs([]).live, false);
  assert.equal(evaluation.parseArgs([]).limit, 3);
  assert.equal(evaluation.parseArgs(['--live', '--limit', '1']).live, true);
  for (const args of [['--limit', '0'], ['--limit', '21'], ['--unknown']])
    assert.throws(() => evaluation.parseArgs(args));
});
