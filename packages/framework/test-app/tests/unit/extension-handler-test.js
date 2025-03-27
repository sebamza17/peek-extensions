import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import ExtensionHandler, { ExtensionNames } from 'peek-extensions-framework-test/ExtensionHandler'
import ExtensionLogger from 'peek-extensions-framework-test/ExtensionLogger'
import GenericExtension from 'peek-extensions-framework-test/classes/GenericExtension'
import ExtensionRegistry from 'peek-extensions-framework-test/ExtensionRegistry'
import sinon from 'sinon'

module('Unit | Handler | ExtensionHandler', function(hooks) {
  setupTest(hooks)

  let sinonSandbox
  let extensionsAPI
  let owner

  hooks.beforeEach(function() {
    sinonSandbox = sinon.createSandbox()
    owner = new Object()

    extensionsAPI = {
      methods: {
        testMethod: sinonSandbox.stub()
      },
      logger: {
        log: sinonSandbox.stub(),
        logError: sinonSandbox.stub()
      },
      styles: {
        customProperties: [],
        setCSSCustomProperty: sinonSandbox.stub()
      },
      constants: {
        testConstant: 'test'
      },
      apolloGql: {}
    }
  })

  hooks.afterEach(function() {
    sinonSandbox.restore()
  })

  test('can setup extensions', function(assert) {
    const extensionName = ExtensionNames.GENERIC
    const extensionData = {
      name: 'generic'
    }
    const logsEnabled = false

    const builtExtension = ExtensionHandler.setupExtension(
      extensionName,
      owner,
      sinonSandbox.stub(),  // sendEventToApp
      sinonSandbox.stub(),  // subscribeToAppEvent
      sinonSandbox.stub(),  // loadImports
      extensionsAPI,
      extensionData,
      logsEnabled
    )

    assert.strictEqual(
      ExtensionLogger.enabled,
      logsEnabled,
      'Logger enabled state matches input'
    )

    assert.true(
      builtExtension instanceof GenericExtension,
      'Built extension is instance of GenericExtension'
    )

    assert.true(
      builtExtension.uniqId.includes(builtExtension.constructor.name),
      'Extension ID includes constructor name'
    )

    assert.true(
      builtExtension.uniqId.includes(owner.constructor.name),
      'Extension ID includes owner name'
    )

    const registeredExtensions = ExtensionRegistry.getRegisteredExtensions(owner)
    assert.strictEqual(
      registeredExtensions[0],
      builtExtension,
      'Extension is properly registered to owner'
    )

    assert.strictEqual(
      builtExtension.extensionsAPI,
      extensionsAPI,
      'Peek API is properly set on extension'
    )
  })
})
