const merge = require('webpack-merge');
const baseConfig = require('./webpack.base.js');

module.exports = merge(baseConfig, {
  devtool: 'cheap-module-eval-source-map',
  watch: true,
});
