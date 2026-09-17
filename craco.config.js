const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const path = require('path');

module.exports = {
  webpack: {
    entry: './src/index.js',
    plugins: [new NodePolyfillPlugin({ excludeAliases: ['console'] })],
    resolve: {
      extensions: ['.web.js', '.mjs', '.js', '.json', '.web.jsx', '.jsx']
    },
    configure: (webpackConfig, { env, paths }) => {
      if (process.env.TEST_TMP_ROOT) {
        for (const plugin of webpackConfig.plugins || []) {
          if (plugin?.constructor?.name === 'ESLintWebpackPlugin') {
            plugin.options.cacheLocation = path.join(
              process.env.TEST_TMP_ROOT,
              'eslintcache'
            );
          }
        }
        if (webpackConfig.cache && webpackConfig.cache.type === 'filesystem') {
          webpackConfig.cache.cacheDirectory = path.join(
            process.env.TEST_TMP_ROOT,
            'webpack'
          );
        }
      }
      const isCordovaDebug = process.argv.includes('--cordova-debug');
      const isWindows = process.platform === 'win32';
      if (isCordovaDebug) {
        webpackConfig.mode = 'development';
        webpackConfig.optimization = { minimize: false };
        console.log('Cordova debug mode enabled');
      }

      webpackConfig.ignoreWarnings = [
        function ignoreSourcemapsloaderWarnings(warning) {
          return (
            warning.module?.resource.includes('node_modules') &&
            warning.details?.includes('source-map-loader')
          );
        }
      ];

      if (env === 'production' && isWindows) {
        webpackConfig.plugins = (webpackConfig.plugins || []).filter(
          plugin => plugin?.constructor?.name !== 'ForkTsCheckerWebpackPlugin'
        );

        webpackConfig.optimization = webpackConfig.optimization || {};
        webpackConfig.optimization.minimizer = (
          webpackConfig.optimization.minimizer || []
        ).map(plugin => {
          const pluginName = plugin?.constructor?.name;

          if (
            pluginName === 'TerserPlugin' ||
            pluginName === 'CssMinimizerPlugin'
          ) {
            plugin.options = {
              ...(plugin.options || {}),
              parallel: false
            };
          }

          return plugin;
        });
      }

      return webpackConfig;
    }
  },
  babel: {
    plugins: ['babel-plugin-transform-import-meta']
  },
  jest: {
    configure: {
      setupFiles: ['<rootDir>/src/setupPolyfills.js']
    }
  }
};
