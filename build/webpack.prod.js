const merge = require('webpack-merge');
const baseConfig = require('./webpack.base.js');

module.exports = merge(baseConfig, {
  externals: ['react', 'react-dom', 'prop-types'],
});
