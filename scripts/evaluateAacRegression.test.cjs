const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluate,
  corpora,
  verifyFrozen
} = require('./evaluateAacRegression.cjs');
const {
  loadCore,
  checkCorpus
} = require('./evaluateCommunicationSegmentation.cjs');
test('corpus IDs disjoint and references cover negation, order, quantities and unknowns', () => {
  const ids = Object.values(corpora).flatMap(corpus =>
    checkCorpus(corpus).map(row => row.id)
  );
  assert.equal(new Set(ids).size, 80);
  for (const name of ['expansion', 'frozen']) {
    const categories = new Set(corpora[name].cases.map(row => row.category));
    assert.equal(categories.size, 10);
  }
});
test('actual CBoard matching preserves all 80 synthetic sources and exposes unresolved content', () => {
  const results = evaluate();
  assert.equal(
    Object.values(results).reduce((sum, item) => sum + item.sourcePreserved, 0),
    80
  );
  assert.ok(results.expansion.rows.some(row => row.unresolvedTokens.length));
  assert.ok(results.frozen.requiresHumanSemanticReview);
});
test('existing safe matching refuses generic replacement of protected meanings', () => {
  const core = loadCore();
  const pairs = [
    ['腰疼', '痛'],
    ['牙痛', '痛'],
    ['散步', '走'],
    ['回去', '回家'],
    ['洗', '洗手'],
    ['躺', '睡觉']
  ];
  for (const [token, generic] of pairs) {
    const result = core.matchTextToCommunicationTiles(
      token,
      [
        {
          id: 'synthetic',
          tiles: [
            {
              id: 'wrong',
              label: generic,
              synonyms: [token],
              image: '/synthetic.png'
            }
          ]
        }
      ],
      { preSegmented: [token], preserveSegments: true, allowPartial: false }
    );
    assert.equal(result.matches[0].token, token);
    assert.equal(result.matches[0].tile, null);
  }
});
test('frozen collection is explicitly a synthetic candidate, not independent clinical gold', () => {
  assert.equal(corpora.frozen.evaluationRole, 'frozen-candidate');
  assert.match(corpora.frozen.scope, /not an independent blind test/);
  assert.throws(() => verifyFrozen(Buffer.from('{}')), /REQUIRES_NEW_VERSION/);
});
