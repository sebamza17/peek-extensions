import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import ExtensionRegistry from 'peek-extensions-utils-test/ExtensionRegistry'
import { ExtensionNames } from 'peek-extensions-utils-test/ExtensionHandler'
import GenericExtension from 'peek-extensions-utils-test/classes/GenericExtension'

module('Unit | Utility | ExtensionRegistry', function(hooks) {
  setupTest(hooks)

  const createMockExtension = () => {
    return new GenericExtension(
      () => null, // sendEventToApp
      () => null, // subscribeToAppEvent
      () => null, // loadImports
      {}, // extensionsAPI
      {
        name: ExtensionNames.HTML
      }
    )
  }

  test('can register extensions', function(assert) {
    const owner = new Object()
    const extensionA = createMockExtension()
    const extensionB = createMockExtension()

    // Register the 2 extensions to the same owner
    ExtensionRegistry.register(owner, extensionA)
    ExtensionRegistry.register(owner, extensionB)

    const registeredExtensions = ExtensionRegistry.extensions.get(owner)

    assert.strictEqual(
      registeredExtensions[0],
      extensionA,
      'First extension is properly registered'
    )

    assert.strictEqual(
      registeredExtensions[1],
      extensionB,
      'Second extension is properly registered'
    )
  })

  test('can recover registered extension by ID', function(assert) {
    const owner = new Object()
    const extension = createMockExtension()

    ExtensionRegistry.register(owner, extension)

    const recoveredExtension = ExtensionRegistry.getRegisteredExtension(owner, extension.uniqId)

    assert.strictEqual(
      recoveredExtension,
      extension,
      'Extension can be retrieved by its unique ID'
    )
  })

  test('can recover registered extensions', function(assert) {
    const ownerA = new Object()
    const ownerB = new Object()
    const extensionA = createMockExtension()
    const extensionB = createMockExtension()

    ExtensionRegistry.register(ownerA, extensionA)
    ExtensionRegistry.register(ownerB, extensionB)

    const extensionsForOwnerA = ExtensionRegistry.getRegisteredExtensions(ownerA)
    const extensionsForOwnerB = ExtensionRegistry.getRegisteredExtensions(ownerB)

    assert.strictEqual(
      extensionsForOwnerA[0],
      extensionA,
      'Extension A is properly registered to owner A'
    )

    assert.strictEqual(
      extensionsForOwnerB[0],
      extensionB,
      'Extension B is properly registered to owner B'
    )
  })

  test('can remove registered extensions', function(assert) {
    const ownerA = new Object()
    const ownerB = new Object()
    const extensionA = createMockExtension()
    const extensionB = createMockExtension()

    ExtensionRegistry.register(ownerA, extensionA)
    ExtensionRegistry.register(ownerB, extensionB)

    ExtensionRegistry.removeExtensions(ownerA)

    const extensionsForOwnerA = ExtensionRegistry.getRegisteredExtensions(ownerA)
    const extensionsForOwnerB = ExtensionRegistry.getRegisteredExtensions(ownerB)

    assert.strictEqual(
      extensionsForOwnerA[0],
      undefined,
      'Extensions for owner A were removed'
    )

    assert.strictEqual(
      extensionsForOwnerB[0],
      extensionB,
      'Extensions for owner B remain registered'
    )
  })
})
