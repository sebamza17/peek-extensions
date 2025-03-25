import ExtensionRegistry from 'peek-extensions-utils-test/ExtensionRegistry'
import {
  Extension,
  type EventData,
  type ExtensionData,
  type ExtensionDependency,
  type PeekExtensionsAPI,
} from 'peek-extensions-utils-test/Extension';
import * as AvailableExtensions from 'peek-extensions-utils-test/classes/AvailableExtensions'
import uid from 'peek-extensions-utils-test/helpers/uniq-id'
import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'
import ExtensionStyles from 'peek-extensions-utils-test/ExtensionStyles'

export enum ExtensionNames {
  GENERIC = 'GenericExtension',
  HTML = 'HTMLExtension',
  IframeHTML = 'IframeHTMLExtension'
}

export interface ExtensionStructure {
  name: ExtensionNames
  data: ExtensionData
}

export default class ExtensionHandler {
  static loggerSet: boolean = false
  static CSSCustomPropertiesSet: boolean = false

  /**
   * loads an extension for a given owner
   * @param extensionName: ExtensionNames
   * @param owner: object
   * @param sendEventToApp: (eventData: any) => void
   * @param extensionData: ExtensionData
   */
  static setupExtension (
    extensionName: ExtensionNames,
    owner: object,
    sendEventToApp: (eventData: EventData) => void,
    listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void,
    loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>,
    extensionsAPI: PeekExtensionsAPI,
    extensionData: ExtensionData,
    enableLogging: boolean = false
  ): Extension {
    if (!this.loggerSet) {
      this.loggerSet = true
      ExtensionLogger.enabled = enableLogging
    }

    if (!this.CSSCustomPropertiesSet) {
      this.CSSCustomPropertiesSet = true
      ExtensionStyles.writeCSSCustomProperties()
    }

    const extensionToConstruct = AvailableExtensions[extensionName]

    if (!extensionToConstruct) {
      throw new Error(`ExtensionHandler:setupExtension(): extension ${extensionName} not found`)
    }

    // eslint-disable-next-line no-useless-catch
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore extensionData must be ExtensionData, but it's getting interpreted as SpecificExtensionData
      const extension: Extension = new extensionToConstruct(sendEventToApp, listenToAppEvent, loadImports, extensionsAPI, extensionData)
      const prefix = `${extension.constructor.name}-${owner.constructor.name}`
      extension.uniqId = uid(prefix)

      // we register the extension to the owner on our ExtensionRegistry
      ExtensionRegistry.register(owner, extension)
      ExtensionLogger.log(`ExtensionHandler::setupExtension(): ${extensionName} loaded for ${owner.constructor.name}`)

      return extension
    } catch (error) {
      throw error
    }
  }

  static getRegisteredExtensions (owner: object): Extension[] {
    return ExtensionRegistry.getRegisteredExtensions(owner)
  }

  static removeRegisteredExtensions (owner: object): void {
    ExtensionRegistry.removeExtensions(owner)
  }

  static isRegisteredExtension (owner: object, extension: Extension): boolean {
    return ExtensionRegistry.isRegisteredExtension(owner, extension)
  }
}
