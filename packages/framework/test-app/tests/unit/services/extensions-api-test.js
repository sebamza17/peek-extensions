import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import { inject as service } from '@ember/service'
import sinon from 'sinon'
import Service from '@ember/service'
import ExtensionsAPIService from 'peek-extensions-framework-test/services/extensions/extensions-api'


// mock a service that will be indirectly called from extensions-api code
class MockLegacyModalHandlerService extends Service {
  openLegacyModal(modalType, options = {}) {
    // Mock implementation
    return Promise.resolve(modalType, options)
  }
}

// override extension-api service to include mocks for this test suite
class MockExtensionsAPIService extends ExtensionsAPIService {
  @service('legacy-modal-handler') legacyModalHandler

  getAPIProxy(logsEnabled = false) {
    const baseProxy = super.getAPIProxy(logsEnabled)

    return {
      ...baseProxy,
      methods: {
        ...baseProxy.methods,
        redirectTo: this.redirectTo.bind(this),
        showToast: this.showToast.bind(this),
        openLegacyModal: this.openLegacyModal.bind(this)
      }
    }
  }

  redirectTo(caller, path) {
    return Promise.resolve(caller, path)
  }

  showToast(caller, type, message) {
    return Promise.resolve(caller, type, message)
  }

  openLegacyModal(caller, modalType, options = {}) {
    return this.legacyModalHandler.openLegacyModal(caller, modalType, options)
  }
}

module('Unit | Service | extension-tests | extensions API', function (hooks) {
  setupTest(hooks)

  let sinonSandbox

  hooks.beforeEach(function () {
    sinonSandbox = sinon.createSandbox()
    // Register both mock services
    this.owner.register('service:extensions/extensions-api', MockExtensionsAPIService)
    this.owner.register('service:legacy-modal-handler', MockLegacyModalHandlerService)
  })

  hooks.afterEach(function () {
    sinonSandbox.restore()
  })

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:extensions/extensions-api')
    assert.ok(service)
  })

  test('can call a method on an extension instance', async function (assert) {
    const service = this.owner.lookup('service:extensions/extensions-api')
    const legacyModalService = this.owner.lookup('service:legacy-modal-handler')
    const legacyModalSpy = sinonSandbox.spy(legacyModalService, 'openLegacyModal')

    const caller = {}

    // mock a call that would be made from extension code
    const proxy = service.getAPIProxy()

    // mock a call that would be made from extension code
    const openLegacyModalOptions = {
      open: true,
      test: true
    }

    proxy.methods.openLegacyModal(caller, 'openBookingWindow', openLegacyModalOptions)

    // target service is called with its own args
    assert.true(legacyModalSpy.calledOnce)
    assert.true(legacyModalSpy.calledWith(caller, 'openBookingWindow', openLegacyModalOptions))
  })
})
