// Metro bundler config: the default Expo config, plus .tflite files as assets (the strip-region detector model).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
