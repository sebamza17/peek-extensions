import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import { setupMirage } from '@peek/client/tests/utils/util'
import { ExtensionNames } from 'peek-extensions-utils-test/ExtensionHandler'
import { ExtensionDependencyType } from 'peek-extensions-utils-test/Extension'
import { WINDOW_SCRIPT_LOAD_EVENT } from '@peek/client/services/extensions/extension-handler'

module('Unit | Service | extension-tests | extension handler', function (hooks) {
  setupTest(hooks)
  setupMirage(hooks)

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    assert.ok(service)
  })

  test('can setup extension', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    const owner = {}
    const extension = { name: ExtensionNames.GENERIC, data: {} }
    const newExtension = service.setupExtension(extension, owner)

    assert.ok(newExtension)
    assert.true(service.activeExtensions.includes(newExtension))
  })

  test('can setup multiple extensions at the same time', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    const owner = {}
    const extensionA = { name: ExtensionNames.GENERIC, data: {} }
    const extensionB = { name: ExtensionNames.GENERIC, data: {} }
    const extensions = service.setupExtensions([extensionA, extensionB], owner)

    assert.ok(extensions)
    assert.true(extensions.length === 2)

    assert.true(service.activeExtensions.includes(extensions[0]))
    assert.true(service.activeExtensions.includes(extensions[1]))
  })

  test('can return registered extensions for a given owner', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    const owner = {}
    const extension = { name: ExtensionNames.GENERIC, data: {} }
    const newExtension = service.setupExtension(extension, owner)

    const registeredExtensions = service.getRegisteredExtensions(owner)
    assert.true(registeredExtensions.includes(newExtension))
  })

  test('can return whether an extension is from a given owner or not', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    const owner = {}
    const owner2 = {}
    const extension = { name: ExtensionNames.GENERIC, data: {} }
    const extension2 = { name: ExtensionNames.GENERIC, data: {} }
    const newExtension = service.setupExtension(extension, owner)
    const newExtension2 = service.setupExtension(extension2, owner2)

    assert.true(service.isRegisteredExtension(owner, newExtension))
    assert.false(service.isRegisteredExtension(owner2, newExtension))
    assert.true(service.isRegisteredExtension(owner2, newExtension2))
  })

  test('can remove registered extensions', function (assert) {
    const service = this.owner.lookup('service:extensions/extension-handler')
    const owner = {}
    const owner2 = {}
    const extension = { name: ExtensionNames.GENERIC, data: {} }
    const extension2 = { name: ExtensionNames.GENERIC, data: {} }
    const newExtension = service.setupExtension(extension, owner)
    const newExtension2 = service.setupExtension(extension2, owner2)

    assert.true(service.isRegisteredExtension(owner, newExtension))
    assert.false(service.isRegisteredExtension(owner2, newExtension))
    assert.true(service.isRegisteredExtension(owner2, newExtension2))

    service.removeExtensions(owner)

    assert.false(service.isRegisteredExtension(owner, newExtension))
    assert.true(service.isRegisteredExtension(owner2, newExtension2))
  })

  module('extension dependency load', function (hooks) {
    let extensionHandlerService

    // here we create a flag and a simple fn handler for window events on dependencies load
    let receivedWindowEventOnDependencyLoad = false
    const windowEventHandlerOnDependencyLoad = () => {
      receivedWindowEventOnDependencyLoad = true
    }

    hooks.beforeEach(function () {
      extensionHandlerService = this.owner.lookup('service:extensions/extension-handler')
    })

    hooks.afterEach(function () {
      receivedWindowEventOnDependencyLoad = false
      window.removeEventListener(`${WINDOW_SCRIPT_LOAD_EVENT}-1`, windowEventHandlerOnDependencyLoad)
    })

    test('can load bundled local web-components (web-components type)', async function (assert) {
      // web-component dependencies should resolve as modules and create a single script tag on the page
      // with the "dist/components" folder url on script[src] attribute
      const webComponentDependency = {
        name: 'peek-ai-panel-wc',
        importPath: 'peek-ai-panel/panel',
        type: ExtensionDependencyType.WEB_COMPONENT,
        isMainScript: true
      }

      const dependencies = [
        webComponentDependency
      ]

      const resolvedDependencies = await extensionHandlerService.loadExtensionImports(dependencies)

      assert.true(resolvedDependencies[webComponentDependency.name].isMainScript)

      const webComponentsScriptTag = document.querySelector('script[src*="dist_components"]')

      assert.dom(webComponentsScriptTag)
    })

    test('can load local bundled extensions (dependency type)', async function (assert) {
      // local bundled dependencies should resolve as modules and create a single script tag on the page
      // with its "url" on script[src] attribute
      const localBundleDependency = {
        name: 'test-extension',
        url: 'test-extension/index',
        type: ExtensionDependencyType.DEPENDENCY,
        isMainScript: true
      }

      const dependencies = [
        localBundleDependency
      ]

      const resolvedDependencies = await extensionHandlerService.loadExtensionImports(dependencies)

      assert.true(resolvedDependencies[localBundleDependency.name].isMainScript)

      const localBundleScriptTag = document.querySelector(`script[src*="${localBundleDependency.url}"]`)

      assert.dom(localBundleScriptTag)
    })

    test('can load extension dependencies (generic type)', async function (assert) {
      // whenever a dependency is loaded via <script>, an event on window is triggered
      // we want to check that this event is being fired correctly
      window.addEventListener(`${WINDOW_SCRIPT_LOAD_EVENT}-1`, windowEventHandlerOnDependencyLoad)

      const mainScriptDependency = {
        name: 'doom-init',
        url: 'https://sebamza17.github.io/js/doom.js',
        type: ExtensionDependencyType.GENERIC,
        scriptConfig: {
          type: 'module'
        },
        isMainScript: true
      }

      const jqueryDependency = {
        name: 'jquery',
        url: 'https://sebamza17.github.io/js/jquery.js',
        type: ExtensionDependencyType.GENERIC
      }

      const jsDosDependency = {
        name: 'doom',
        url: 'https://sebamza17.github.io/js/js-dos-api.js',
        type: ExtensionDependencyType.GENERIC
      }

      const dependencies = [
        mainScriptDependency,
        jqueryDependency,
        jsDosDependency
      ]

      const resolvedDependencies = await extensionHandlerService.loadExtensionImports(dependencies)

      assert.true(receivedWindowEventOnDependencyLoad)

      // check that mainScriptDependency object makes sense and each dependency is resolved
      assert.true(!!resolvedDependencies[mainScriptDependency.name])
      assert.true(resolvedDependencies[mainScriptDependency.name].isMainScript)
      assert.true(typeof resolvedDependencies[mainScriptDependency.name].module.default === 'function')
      assert.true(resolvedDependencies[mainScriptDependency.name].module.default.name === 'run')

      // check other dependencies
      assert.true(!!resolvedDependencies[jqueryDependency.name])
      assert.false(resolvedDependencies[jqueryDependency.name].isMainScript)
      assert.true(!!resolvedDependencies[jsDosDependency.name])
      assert.false(resolvedDependencies[jsDosDependency.name].isMainScript)

      // a script should be present on the document head after loading dependencies
      const mainScriptTag = document.querySelector(`head script[src*="${mainScriptDependency.url}"]`)
      const jqueryScriptTag = document.querySelector(`head script[src*="${jqueryDependency.url}"]`)
      const jsDosScriptTag = document.querySelector(`head script[src*="${jsDosDependency.url}"]`)

      assert.dom(mainScriptTag).exists()
      assert.dom(jqueryScriptTag).exists()
      assert.dom(jsDosScriptTag).exists()
    })
  })
})
