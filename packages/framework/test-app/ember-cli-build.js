'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  let app = new EmberApp(defaults, {
    name: 'extension-test-app',
    'ember-cli-babel': { enableTypeScriptTransform: true },
    autoImport: {
      allowAppImports: ['peek-extensions-framework-test/*'],
      watchDependencies: ['@peek-extensions', 'peek-extensions-framework-test'],
    },
  });

  const { maybeEmbroider } = require('@embroider/test-setup');
  return maybeEmbroider(app);
};
