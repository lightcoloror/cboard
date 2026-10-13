'use strict';

// Evaluation glue around the existing CBoard core and authenticated API.
// Default offline; live requests contain only the checked-in synthetic corpus.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const corpus = require('../src/common/communicationSupport/fixtures/resegmentationEvaluation.json');

function loadCore() {
  const root = path.resolve(__dirname, '..');
  const core = path.join(root, 'src/common/communicationSupport');
  const translation = path.join(
    root,
    'src/translations/zh-CN.communication.js'
  );
  const babel = require('@babel/core');
  const plugin = require.resolve('@babel/plugin-transform-modules-commonjs');
  const previous = require.extensions['.js'];
  require.extensions['.js'] = (module, filename) => {
    if (!filename.startsWith(core + path.sep) && filename !== translation)
      return previous(module, filename);
    const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [plugin]
    });
    module._compile(result.code, filename);
  };
  try {
    const matching = require(path.join(core, 'symbolMatching.js'));
    const ai = require(path.join(core, 'communicationAi.js'));
    const contract = require(path.join(core, 'resegmentationContract.js'));
    const segmentation = require(path.join(core, 'segmentation.js'));
    const messages = require(translation).default;
    return {
      ...matching,
      ...ai,
      ...contract,
      ...segmentation,
      boards: require('../src/api/boards.json').advanced,
      intl: { messages, formatMessage: ({ id }) => messages[id] || id }
    };
  } finally {
    require.extensions['.js'] = previous;
  }
}

function checkCorpus(value) {
  const ids = new Set();
  if (
    !value ||
    value.evidenceType !== 'synthetic-engineering-corpus' ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  )
    throw new Error('INVALID_SYNTHETIC_CORPUS');
  value.cases.forEach(item => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      Array.from(item.text).length > 120 ||
      !Array.isArray(item.referenceTokens) ||
      !item.referenceTokens.length ||
      item.referenceTokens.some(
        token => typeof token !== 'string' || !token.length
      ) ||
      item.referenceTokens.join('') !== item.text
    )
      throw new Error('INVALID_CORPUS_REFERENCE');
    ids.add(item.id);
  });
  return value.cases;
}

function boundaryScore(tokens, reference) {
  const boundaries = list => {
    let cursor = 0;
    return new Set(
      list.slice(0, -1).map(token => {
        cursor += Array.from(token).length;
        return cursor;
      })
    );
  };
  const actual = boundaries(tokens);
  const expected = boundaries(reference);
  const hits = [...actual].filter(offset => expected.has(offset)).length;
  const precision = actual.size ? hits / actual.size : expected.size ? 0 : 1;
  const recall = expected.size ? hits / expected.size : actual.size ? 0 : 1;
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  };
}

function summarizeMatch(item, result, elapsedMs) {
  const tokens = result.matches.map(match => match.token);
  const lexical = result.matches.filter(
    match => !/^[\s\p{P}]+$/u.test(match.token)
  );
  const matched = lexical.filter(match => match.tile && !match.tile.textOnly);
  return {
    id: item.id,
    sourcePreserved: tokens.join('') === item.text,
    tokens,
    elapsedMs,
    referenceBoundaryScore: boundaryScore(tokens, item.referenceTokens),
    lexicalCount: lexical.length,
    imageCount: matched.length,
    unresolvedTokens: lexical
      .filter(match => !match.tile)
      .map(match => match.token),
    imageMatches: matched.map(match => ({
      sourceToken: match.token,
      imageLabel: match.tile.displayLabel || match.tile.tile.label,
      matchType: match.matchType
    })),
    requiresHumanSemanticReview: true
  };
}

function evaluateLocal(core, cases = checkCorpus(corpus)) {
  return cases.map(item => {
    const start = performance.now();
    const result = core.matchTextToCommunicationTiles(item.text, core.boards, {
      intl: core.intl
    });
    return summarizeMatch(item, result, performance.now() - start);
  });
}

function makeEndpoint(base) {
  const url = new URL(base);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
  )
    throw new Error('INVALID_EVALUATION_ENDPOINT');
  return url.toString().replace(/\/$/, '') + '/gpt/communication/resegment';
}

async function collectLive(core, cases, env, fetchImpl = fetch) {
  const keys = [
    'CBOARD_API_BASE_URL',
    'RESEGMENT_EVAL_TOKEN',
    'RESEGMENT_EVAL_PROFILE_ID',
    'RESEGMENT_EVAL_FUNDING_ID'
  ];
  const missing = keys.filter(key => !String(env[key] || '').trim());
  if (missing.length)
    return {
      status: 'blocked',
      reason: 'MISSING_API_TEST_CONFIGURATION',
      missing,
      requestCount: 0,
      results: []
    };
  const endpoint = makeEndpoint(env.CBOARD_API_BASE_URL);
  const results = [];
  const runId = crypto.randomUUID();
  for (const item of cases) {
    const local = core.matchTextToCommunicationTiles(item.text, core.boards, {
      intl: core.intl
    });
    const data = core.buildCommunicationAiResegmentRequest({
      text: item.text,
      boards: core.boards,
      intl: core.intl,
      reviewItems: local.matches
    });
    const start = performance.now();
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEGMENT_EVAL_TOKEN}`,
          'X-Care-Profile-Id': env.RESEGMENT_EVAL_PROFILE_ID,
          'X-Care-Funding-Id': env.RESEGMENT_EVAL_FUNDING_ID,
          'Idempotency-Key': `synthetic-resegment-${runId}-${item.id}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        results.push({
          id: item.id,
          accepted: false,
          status: response.status,
          errorCode: 'API_REQUEST_REJECTED',
          elapsedMs: performance.now() - start
        });
        break;
      }
      const normalized = core.normalizeResegmentResponse(
        item.text,
        await response.json()
      );
      if (!normalized) {
        results.push({
          id: item.id,
          accepted: false,
          errorCode: 'AI_RESEGMENT_SOURCE_MISMATCH',
          elapsedMs: performance.now() - start
        });
        break;
      }
      const mapped = core.matchTextToCommunicationTiles(
        item.text,
        core.boards,
        {
          intl: core.intl,
          preSegmented: normalized.tokens,
          preserveSegments: true,
          allowPartial: false
        }
      );
      results.push({
        ...summarizeMatch(item, mapped, performance.now() - start),
        accepted: true,
        usageRequestId: response.headers?.get('X-Care-Usage-Request') || null
      });
    } catch (error) {
      // Do not log provider messages, URLs, headers or tokens; no blind retries.
      results.push({
        id: item.id,
        accepted: false,
        errorCode: 'NETWORK_OR_RESPONSE_FAILURE',
        elapsedMs: performance.now() - start
      });
      break;
    }
  }
  return {
    status:
      results.length === cases.length && results.every(item => item.accepted)
        ? 'completed'
        : 'incomplete',
    evidenceType: 'authenticated-api',
    requestCount: results.length,
    results,
    actualCost: null,
    costNote:
      'Read the server funding ledger; this report does not estimate or certify billing.'
  };
}

function parseArgs(args) {
  const result = {
    live: false,
    limit: 3,
    out: path.resolve('segmentation-evaluation.json')
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') result.live = true;
    else if (args[i] === '--out' && args[i + 1])
      result.out = path.resolve(args[++i]);
    else if (args[i] === '--limit' && /^\d+$/.test(args[i + 1]))
      result.limit = Number(args[++i]);
    else throw new Error('INVALID_EVALUATION_ARGUMENT');
  }
  if (
    !Number.isInteger(result.limit) ||
    result.limit < 1 ||
    result.limit > corpus.cases.length
  )
    throw new Error('INVALID_CASE_LIMIT');
  return result;
}

async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args);
  const cases = checkCorpus(corpus);
  const core = loadCore();
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    corpusSha256: crypto
      .createHash('sha256')
      .update(JSON.stringify(corpus))
      .digest('hex'),
    corpusType: corpus.evidenceType,
    referenceNote: corpus.scope,
    local: evaluateLocal(core, cases),
    live: options.live
      ? await collectLive(core, cases.slice(0, options.limit), env)
      : { status: 'not-requested', requestCount: 0 },
    limitations: [
      'Synthetic engineering references are not clinical gold annotations.',
      'Boundary agreement and image counts do not prove AAC meaning correctness.',
      'Local timings are not production or phone timings.',
      'API success does not prove a real model was used; verify server provider and ledger separately.'
    ]
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      localCases: report.local.length,
      sourcePreserved: report.local.filter(item => item.sourcePreserved).length,
      liveStatus: report.live.status,
      requestCount: report.live.requestCount,
      output: options.out
    })
  );
  if (options.live && report.live.status !== 'completed') process.exitCode = 2;
  return report;
}

if (require.main === module)
  main().catch(() => {
    console.error('EVALUATION_FAILED');
    process.exitCode = 1;
  });
module.exports = {
  corpus,
  loadCore,
  checkCorpus,
  boundaryScore,
  evaluateLocal,
  makeEndpoint,
  collectLive,
  parseArgs,
  main
};
