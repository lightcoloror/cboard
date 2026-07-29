const path = require('path');
const boards = require('./src/api/boards.json');

const buildPath = process.env.BUILD_PATH
  ? path
      .resolve(process.env.BUILD_PATH)
      .split(path.sep)
      .join('/')
  : 'build';
const buildPrefix = `${buildPath}/`;

function mapImagesToGlobs(boards, globPrefix) {
  let globs = [];
  Object.keys(boards).forEach(boardId => {
    const tiles = boards[boardId].tiles;
    Object.keys(tiles).forEach(tileId => {
      if (tiles[tileId].image) {
        const glob = globPrefix + tiles[tileId].image;
        if (globs.indexOf(glob) >= 0) {
          return;
        }
        globs.push(glob);
      }
    });
  });
  console.log(
    globs.forEach(glob => {
      console.log(glob);
    })
  );
  return globs;
}

const boardImages = mapImagesToGlobs(boards.advanced, buildPrefix);

module.exports = {
  stripPrefix: buildPrefix,
  staticFileGlobs: [
    `${buildPrefix}*.html`,
    `${buildPrefix}manifest.json`,
    `${buildPrefix}static/**/!(*map*)`,
    ...boardImages
  ],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB
  runtimeCaching: [
    {
      urlPattern: /\/symbols\/mulberry/,
      handler: 'cacheFirst',
      options: {
        cache: {
          name: 'symbols-mulberry'
        }
      }
    },
    {
      urlPattern: /\/symbols\/arasaac/,
      handler: 'cacheFirst',
      options: {
        cache: {
          name: 'symbols-arasaac'
        }
      }
    },
    {
      urlPattern: /\/symbols\/cboard/,
      handler: 'cacheFirst',
      options: {
        cache: {
          name: 'symbols-cboard'
        }
      }
    }
  ],
  navigateFallback: '/index.html',
  dontCacheBustUrlsMatching: /\.\w{8}\./,
  dynamicUrlToDependencies: {
    '/': [`${buildPrefix}index.html`]
  },
  swFilePath: `${buildPrefix}service-worker.js`
};
