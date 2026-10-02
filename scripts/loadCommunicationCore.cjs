'use strict';

// Reuse the Babel loading adapter from evaluateCommunicationSegmentation.cjs,
// restricted to local segmentation/matching. No AI, corpus or network entrypoint.
const fs = require('node:fs');
const path = require('node:path');

function loadCore() {
  const root = path.resolve(__dirname, '..');
  const core = path.join(root, 'src/common/communicationSupport');
  const translation = path.join(root, 'src/translations/zh-CN.communication.js');
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
    const segmentation = require(path.join(core, 'segmentation.js'));
    const messages = require(translation).default;
    return {
      ...matching,
      ...segmentation,
      intl: { messages, formatMessage: ({ id }) => messages[id] || id }
    };
  } finally {
    require.extensions['.js'] = previous;
  }
}

module.exports = { loadCore };
