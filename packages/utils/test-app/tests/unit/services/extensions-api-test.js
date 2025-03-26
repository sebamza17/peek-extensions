import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import { setupMirage } from '@peek/client/tests/utils/util'
import sinon from 'sinon'

module('Unit | Service | extension-tests | extensions API', function (hooks) {
  setupTest(hooks)
  setupMirage(hooks)

  let sinonSandbox

  hooks.beforeEach(function () {
    sinonSandbox = sinon.createSandbox()
  })

  hooks.afterEach(function () {
    sinonSandbox.restore()
  })

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:extensions/extensions-api')
    assert.ok(service)
  })

  test('creates a valid proxy object to send to extension instances', async function (assert) {
    const service = this.owner.lookup('service:extensions/extensions-api')

    const proxy = service.getAPIProxy()

    assert.true(!!proxy)
    assert.true(!!proxy.constants)
    assert.true(!!proxy.styles)
    assert.true(!!proxy.logger)
    assert.true(!!proxy.logger.log)
    assert.true(!!proxy.logger.logError)
    assert.true(!!proxy.methods.redirectTo)
    assert.true(!!proxy.methods.showToast)
    assert.true(!!proxy.methods.openLegacyModal)
  })

  test('can call a method on an extension instance', async function (assert) {
    const service = this.owner.lookup('service:extensions/extensions-api')
    const legacyModalService = this.owner.lookup('service:legacy-modal-handler')
    const legacyModalSpy = sinonSandbox.spy(legacyModalService, 'openLegacyModal')

    const caller = {}

    // mock a call that would be made from extension code
    const proxy = service.getAPIProxy()
    proxy.methods.showToast(caller, 'info', 'Hello World!')

    // mock a call that would be made from extension code
    const openLegacyModalOptions = {}
    proxy.methods.openLegacyModal(caller, 'openBookingWindow', openLegacyModalOptions)

    // target service is called with its own args
    assert.true(legacyModalSpy.calledOnce)
    assert.true(legacyModalSpy.calledWithMatch('openBookingWindow', openLegacyModalOptions))
  })
})
