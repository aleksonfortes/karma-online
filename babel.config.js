// For Jest tests that need to transform ES modules
export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
        modules: 'auto'
      },
    ],
  ],
}; 