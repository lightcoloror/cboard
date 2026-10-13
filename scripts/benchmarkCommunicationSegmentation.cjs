'use strict';

// Offline dataset/format glue around existing CBoard and the official UD scorer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { loadCore } = require('./evaluateCommunicationSegmentation.cjs');
const sha = value =>
  crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
const withoutSpaces = value => value.replace(/\p{Zs}/gu, '');

function coreHashes() {
  const root = path.resolve(__dirname, '../src/common/communicationSupport');
  return Object.fromEntries(
    fs
      .readdirSync(root)
      .filter(file => /\.(js|json)$/.test(file) && !file.includes('.test.'))
      .sort()
      .map(file => [file, sha(fs.readFileSync(path.join(root, file)))])
  );
}

function parseConllu(value) {
  const sentences = [];
  const ids = new Set();
  for (const block of value
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const id = lines.find(line => line.startsWith('# sent_id = '))?.slice(12);
    const text = lines.find(line => line.startsWith('# text = '))?.slice(9);
    if (!id || ids.has(id) || !text)
      throw new Error('INVALID_SENTENCE_METADATA');
    const forms = [];
    for (const line of lines.filter(line => !line.startsWith('#'))) {
      const columns = line.split('\t');
      // Explicit scope: no silent dropping of multiword or empty-node rows.
      if (columns.length !== 10 || !/^\d+$/.test(columns[0]))
        throw new Error('UNSUPPORTED_CONLLU_ROW');
      if (+columns[0] !== forms.length + 1 || !columns[1])
        throw new Error('INVALID_CONLLU_ROW');
      forms.push(columns[1]);
    }
    if (!forms.length || withoutSpaces(forms.join('')) !== withoutSpaces(text))
      throw new Error('REFERENCE_SOURCE_MISMATCH');
    ids.add(id);
    sentences.push({ id, text }); // Gold segmentation is never given to the tokenizer.
  }
  return sentences;
}

function makePrediction(sentences, tokenize) {
  return sentences
    .map(({ id, text }) => {
      const tokens = tokenize(text);
      if (
        !Array.isArray(tokens) ||
        tokens.some(t => typeof t !== 'string' || !t) ||
        tokens.join('') !== text
      )
        throw new Error('PREDICTION_SOURCE_MISMATCH');
      // Same Unicode Zs normalization as official UD scoring, only after preservation check.
      const forms = tokens.map(withoutSpaces).filter(Boolean);
      if (!forms.length || forms.some(t => /[\t\r\n]/.test(t)))
        throw new Error('INVALID_PREDICTION_FORM');
      const rows = forms.map((form, i) =>
        [
          i + 1,
          form,
          '_',
          'X',
          '_',
          '_',
          i ? 1 : 0,
          i ? 'dep' : 'root',
          '_',
          'SpaceAfter=No'
        ].join('\t')
      );
      return `# sent_id = ${id}\n${rows.join('\n')}\n\n`;
    })
    .join('');
}

function run({ datasetDir, scorerDir, outDir, python = 'python' }) {
  const dataset = path.resolve(datasetDir);
  const scorer = path.resolve(scorerDir, 'udtools/src/udtools/udeval.py');
  const license = fs.readFileSync(path.join(dataset, 'LICENSE.txt'), 'utf8');
  if (!license.includes('Creative Commons') || !license.includes('4.0'))
    throw new Error('UNVERIFIED_DATASET_LICENSE');
  const gold = path.join(dataset, 'zh_gsdsimp-ud-test.conllu');
  const source = fs.readFileSync(gold, 'utf8');
  const sentences = parseConllu(source);
  const core = loadCore();
  const native = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  const tokenizers = {
    cboard: text => core.segmentChineseCommunicationText(text).segments,
    intlBaseline: text => Array.from(native.segment(text), item => item.segment)
  };
  fs.mkdirSync(outDir, { recursive: true });
  const wrapper = path.join(__dirname, 'scoreUdSegmentation.py');
  execFileSync(python, [wrapper, scorer, '--self-test'], { stdio: 'pipe' });
  const results = {};
  for (const [name, tokenizer] of Object.entries(tokenizers)) {
    const predicted = makePrediction(sentences, tokenizer);
    const file = path.resolve(outDir, `${name}.conllu`);
    fs.writeFileSync(file, predicted);
    const score = JSON.parse(
      execFileSync(python, [wrapper, scorer, gold, file], { encoding: 'utf8' })
    );
    results[name] = {
      sourcePreserved: sentences.length,
      predictionSha256: sha(predicted),
      score
    };
  }
  const gitHead = dir =>
    execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  const report = {
    schemaVersion: 1,
    evidenceType: 'public-offline-segmentation-benchmark',
    evaluatedAt: new Date().toISOString(),
    dataset: 'UD_Chinese-GSDSimp',
    split: 'test',
    sentences: sentences.length,
    datasetCommit: gitHead(dataset),
    scorerCommit: gitHead(scorerDir),
    datasetUrl: 'https://github.com/UniversalDependencies/UD_Chinese-GSDSimp',
    scorerUrl: 'https://github.com/UniversalDependencies/tools',
    datasetLicense: 'CC BY-SA 4.0',
    scorerFileLicense: 'MPL 2.0',
    goldSha256: sha(source),
    scorerSha256: sha(fs.readFileSync(scorer)),
    runtime: { node: process.version, icu: process.versions.icu },
    coreSourceSha256: coreHashes(),
    officialScorerSelfTests: 'passed',
    results,
    limitations: [
      'Wikipedia general text; not aphasia or clinical validation',
      'Only word/token spans scored; syntactic columns are placeholders',
      'AAC intentional compound splitting may differ from UD annotation',
      'No training, product-rule tuning, live API requests or dataset redistribution'
    ]
  };
  fs.writeFileSync(
    path.resolve(outDir, 'ud-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  return report;
}

if (require.main === module) {
  const [datasetDir, scorerDir, outDir, python] = process.argv.slice(2);
  if (!datasetDir || !scorerDir || !outDir || process.argv.includes('--live')) {
    process.stderr.write(
      'Usage: node benchmarkCommunicationSegmentation.cjs DATASET_DIR UD_TOOLS_DIR OUTPUT_DIR [PYTHON]\nOffline only.\n'
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(run({ datasetDir, scorerDir, outDir, python }), null, 2)
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
module.exports = { parseConllu, makePrediction, coreHashes, run };
