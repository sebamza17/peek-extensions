import { decoratorWithParams } from '@ember-decorators/utils/decorator'
export const extendableProperties = new Map()

/**
 * this decorator is used to mark a property as extendable, so those properties/methods can be referenced by extensions
 * code. Otherwise, referencing something that is not @extendable will throw an error on the extension while run()
 */
export const extendable = decoratorWithParams((target: Object, key: string, descriptor: unknown, _params: unknown) => {
  // Initialize the metadata for the target if it doesn't exist
  if (!extendableProperties.has(target.constructor.name)) {
    extendableProperties.set(target.constructor.name, new Set())
  }

  extendableProperties.get(target.constructor.name).add(key)

  return descriptor
}, 'extendable')
