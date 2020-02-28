const merge = require('webpack-merge');
const baseConfig = require('./webpack.base.js');

module.exports = merge(baseConfig, {
  devtool: 'inline-source-map',
  watch: true,
});
