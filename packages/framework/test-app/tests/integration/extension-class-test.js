import { module, test } from 'qunit'
import { setupRenderingTest } from 'ember-qunit'
import { render, waitFor } from '@ember/test-helpers'
import { hbs } from 'ember-cli-htmlbars'
import HTMLExtension from 'peek-extensions-framework-test/classes/HTMLExtension'
import { ExtensionDependencyType, ExtensionStatus } from 'peek-extensions-framework-test/Extension'
import { ExtensionNames } from 'peek-extensions-framework-test/ExtensionHandler'
import sinon from 'sinon'

module('Integration | Class | HTMLExtension', function(hooks) {
  setupRenderingTest(hooks)

  let sendEventToApp
  let loadImports
  let subscribeToAppEvent
  let peekExtensionsAPI
  let sinonSandbox

  hooks.beforeEach(function() {
    sinonSandbox = sinon.createSandbox()

    sendEventToApp = () => null
    loadImports = () => null
    subscribeToAppEvent = () => null

    peekExtensionsAPI = {
      methods: {
        redirectTo: sinonSandbox.stub(),
        showToast: sinonSandbox.stub(),
        openLegacyModal: sinonSandbox.stub()
      },
      logger: {
        log: () => {},
        logError: () => {}
      },
      styles: {
        customProperties: [],
        setCSSCustomProperty: () => {}
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

  test('can create HTML extension class instance and renders its HTML content on the DOM', async function(assert) {
    await render(hbs`
      <div data-extension-target-element></div>
    `)

    const extensionData = {
      dependencies: [],
      html: '<h1 data-test-header>Extension injected HTML</h1>',
      targetSelector: '[data-extension-target-element]'
    }

    const newExtension = new HTMLExtension(
      sendEventToApp,
      subscribeToAppEvent,
      loadImports,
      peekExtensionsAPI,
      extensionData
    )

    assert.strictEqual(newExtension.name, ExtensionNames.HTML, 'Extension name matches')
    assert.strictEqual(newExtension.status, ExtensionStatus.INIT, 'Initial status is correct')
    assert.strictEqual(
      newExtension.extensionData.targetSelector,
      '[data-extension-target-element]',
      'Target selector matches'
    )

    await newExtension.load(true)
    await waitFor('[data-test-header]', { timeout: 2000 })

    assert.dom('[data-test-header]').exists('Extension HTML is rendered')
    assert.dom('[data-test-header]').hasText('Extension injected HTML', 'Extension HTML content matches')
  })

  test('tries to import dependencies', async function(assert) {
    loadImports = sinonSandbox.stub()

    await render(hbs`
      <div data-extension-target-element></div>
    `)

    const mockDependency = {
      name: 'mock-dependency',
      type: ExtensionDependencyType.DEPENDENCY,
      url: 'https://cdn.dependency.com/dependency.js'
    }

    const extensionData = {
      dependencies: [mockDependency],
      html: '<h1 data-test-header>Extension injected HTML</h1>',
      targetSelector: '[data-extension-target-element]'
    }

    const newExtension = new HTMLExtension(
      sendEventToApp,
      subscribeToAppEvent,
      loadImports,
      peekExtensionsAPI,
      extensionData
    )

    assert.strictEqual(newExtension.name, ExtensionNames.HTML, 'Extension name matches')
    assert.strictEqual(newExtension.status, ExtensionStatus.INIT, 'Initial status is correct')
    assert.strictEqual(
      newExtension.extensionData.targetSelector,
      '[data-extension-target-element]',
      'Target selector matches'
    )
    assert.strictEqual(newExtension.loadImports, loadImports, 'Load imports function is set')

    await newExtension.load(true)

    assert.true(
      loadImports.calledWithMatch([mockDependency]),
      'Load imports was called with correct dependency'
    )
  })
})
