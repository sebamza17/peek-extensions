import { Extension } from 'peek-extensions-utils-test/Extension'
import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'

export default class ExtensionRegistry {
  /**
   * JS Map that stores all registered extensions
   */
  static extensions: Map<object, Extension[]> = new Map()

  /**
   * register an extension to a given owner
   * @param owner: object (this can be any JS reference)
   * @param extension: Extension
   */
  static register (owner: object, extension: Extension): void {
    const registeredExtensions = this.extensions.get(owner)

    if (registeredExtensions) {
      ExtensionLogger.log(`ExtensionRegistry::register(): ${extension.constructor.name} registered for new entry ${owner.constructor.name}`)
      registeredExtensions.push(extension)
    } else {
      ExtensionLogger.log(`ExtensionRegistry::register(): ${extension.constructor.name} registered for existing entry ${owner.constructor.name}`)
      this.extensions.set(owner, [extension])
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!window.extensionRegistry) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.extensionRegistry = this
    }
  }

  /**
   * returns all registered extensions for a given owner
   * @param owner: object (this can be any JS reference)
   */
  static getRegisteredExtensions (owner: object): Extension[] {
    return this.extensions.get(owner) ?? []
  }

  /**
   * return specific extension for a given owner
   * @param owner: object (this can be any JS reference)
   * @param uniqId
   */
  static getRegisteredExtension (owner: object, uniqId: string): Extension | undefined {
    return this.extensions.get(owner)?.find(extension => extension.uniqId === uniqId)
  }

  /**
   * checks if a given extension is registered for a given owner
   * @param owner: object (this can be any JS reference)
   * @param givenExtension
   */
  static isRegisteredExtension (owner: object, givenExtension: Extension): boolean {
    return !!this.extensions.get(owner)?.find(extension => extension === givenExtension)
  }

  /**
   * removes all extensions for a given owner
   * @param owner: object (this can be any JS reference)
   */
  static removeExtensions (owner: object): void {
    const registeredExtensions = this.extensions.get(owner)

    if (!registeredExtensions) {
      return
    }

    const removalPromises = registeredExtensions.map(extension => extension.unload())

    // TODO should we care if any of the promises fail on teardown?
    void Promise.allSettled(removalPromises)

    this.extensions.delete(owner)
  }
}
