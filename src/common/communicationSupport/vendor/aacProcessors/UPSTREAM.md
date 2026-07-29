# AACTools AACProcessors vendored browser slice

- Upstream: https://github.com/AACTools/AACProcessors-nodejs
- Package: `@willwade/aac-processors@0.2.20`
- Release: https://github.com/AACTools/AACProcessors-nodejs/releases/tag/v0.2.20
- License: GPL-3.0, preserved in `LICENSE`
- Imported files: the browser-build AsTeRICS Grid and Gridset processors plus only their relative runtime dependencies.

The vendored files are copied from the published 0.2.20 package. PicInterpreter-specific validation, locale selection, image preservation and the minimal Open Board document adapters live outside this directory in `../../astericsGrid.js` and `../../gridset.js` so upstream code remains replaceable and auditable.

The files under `compat/` are mechanically generated from those retained upstream files with Babel's optional-chaining and nullish-coalescing transforms. They preserve the ES module contract while targeting the JavaScript syntax accepted by the WeChat Mini Program production build. Generated files carry only narrowly scoped legacy CBoard ESLint declarations: `globalThis` in `compat/utils/io.js` and the upstream processors' existing mixed-operator/default-case style. These declarations do not change runtime behavior.

One audited browser-only patch is retained in `compat/processors/gridsetProcessor.js`: the optional `GridsetValidator` is injected through `options.gridsetValidator` instead of statically importing the Node-oriented `xml2js` validator. `loadIntoTree()` and the Gridset parsing path are unchanged, while applications that need the optional validation method can still provide the upstream validator explicitly. Keep this exception when regenerating `compat/`; do not make other hand edits without documenting them here.
