import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import sinon from 'sinon'
import ExtensionLogger from 'peek-extensions-framework-test/ExtensionLogger'

module('Unit | Utility | ExtensionLogger', function (hooks) {
  setupTest(hooks)

  let sinonSandbox

  hooks.beforeEach(function() {
    sinonSandbox = sinon.createSandbox()
    ExtensionLogger.logs = []
    ExtensionLogger.enabled = true
  })

  hooks.afterEach(function() {
    sinonSandbox.restore()
  })

  test('can log extension messages', function (assert) {
    const consoleLogSpy = sinonSandbox.spy(console, 'log')
    const consoleErrorSpy = sinonSandbox.spy(console, 'error')

    const logData = {
      data: 'extension generic message'
    }

    ExtensionLogger.log('test message', logData)

    assert.strictEqual(
      ExtensionLogger.logs.length,
      1,
      'One log message was added'
    )

    assert.true(
      consoleLogSpy.calledOnce,
      'console.log was called once'
    )

    assert.true(
      consoleLogSpy.calledWithMatch('🧩 [ExtensionLogger]: test message', logData),
      'console.log was called with correct message and data'
    )

    assert.false(
      consoleErrorSpy.called,
      'console.error was not called'
    )
  })

  test('can log extension errors', function (assert) {
    const consoleLogSpy = sinonSandbox.spy(console, 'log')
    const consoleErrorSpy = sinonSandbox.spy(console, 'error')

    const logData = {
      time: new Date(),
      data: 'extension generic message'
    }

    ExtensionLogger.logError('test message', logData)

    assert.strictEqual(
      ExtensionLogger.logs.length,
      1,
      'One error log was added'
    )

    assert.false(
      consoleLogSpy.called,
      'console.log was not called'
    )

    assert.true(
      consoleErrorSpy.calledOnce,
      'console.error was called once'
    )

    assert.true(
      consoleErrorSpy.calledWithMatch('🧩 [ExtensionLogger - 🚫]: test message', logData),
      'console.error was called with correct message and data'
    )
  })
})
