'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { coreHashes } = require('./benchmarkCommunicationSegmentation.cjs');
const {
  loadCore,
  checkCorpus,
  evaluateLocal,
  corpus: original
} = require('./evaluateCommunicationSegmentation.cjs');
const expansion = require('../src/common/communicationSupport/fixtures/aacRegressionExpansion.json');
const frozen = require('../src/common/communicationSupport/fixtures/aacFrozenCandidate.json');
const corpora = { original, expansion, frozen };
const frozenManifest = require('../src/common/communicationSupport/fixtures/aacFrozenCandidate.manifest.json');

function verifyFrozen(
  bytes = fs.readFileSync(
    path.join(
      __dirname,
      '../src/common/communicationSupport/fixtures/aacFrozenCandidate.json'
    )
  )
) {
  if (
    crypto
      .createHash('sha256')
      .update(bytes)
      .digest('hex') !== frozenManifest.sha256
  )
    throw new Error('FROZEN_CORPUS_CHANGED_REQUIRES_NEW_VERSION');
}

function evaluate() {
  verifyFrozen();
  const core = loadCore();
  return Object.fromEntries(
    Object.entries(corpora).map(([name, corpus]) => {
      const cases = checkCorpus(corpus);
      const rows = evaluateLocal(core, cases);
      return [
        name,
        {
          corpusSha256: crypto
            .createHash('sha256')
            .update(JSON.stringify(corpus))
            .digest('hex'),
          count: rows.length,
          sourcePreserved: rows.filter(row => row.sourcePreserved).length,
          meanReferenceBoundaryF1:
            rows.reduce((sum, row) => sum + row.referenceBoundaryScore.f1, 0) /
            rows.length,
          exactReferenceBoundaries: rows.filter(
            row => row.referenceBoundaryScore.f1 === 1
          ).length,
          requiresHumanSemanticReview: true,
          rows
        }
      ];
    })
  );
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file || process.argv.includes('--live'))
    throw new Error('OFFLINE_OUTPUT_REQUIRED');
  const results = evaluate();
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        evaluatedAt: new Date().toISOString(),
        evidenceType: 'synthetic-offline-engineering',
        frozenCandidateIsIndependent: false,
        coreSourceSha256: coreHashes(),
        results
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([name, { rows, ...summary }]) => [
          name,
          summary
        ])
      ),
      null,
      2
    )
  );
}
module.exports = { evaluate, corpora, verifyFrozen };
