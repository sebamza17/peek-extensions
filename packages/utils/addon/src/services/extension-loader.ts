import Service, { inject as service } from '@ember/service'
import type ExtensionHandlerService from 'peek-extensions-utils-test/services/extension-handler'
import type ExtensionEventsService from 'peek-extensions-utils-test/services/extension-events'
import { ExtensionEventNames } from 'peek-extensions-utils-test/services/extension-events'
import { type ExtensionStructure } from 'peek-extensions-utils-test/ExtensionHandler'
import { tracked } from '@glimmer/tracking'
import { Extension } from 'peek-extensions-utils-test/Extension'

export default class ExtensionLoaderService extends Service {
  @service('extensions/extension-handler') declare extensionHandler: ExtensionHandlerService
  @service('extensions/extension-events') declare extensionEvents: ExtensionEventsService

  @tracked extensions: Extension[] = []

  async loadExtensions (extensionDefinitions: ExtensionStructure[], owner: object = this): Promise<Extension[]> {
    this.extensionEvents.subscribeToExtensionEvent(ExtensionEventNames.EXTENSION_UPDATE, (event: Event): void => {
      this.extensionHandler.log('INCOMING EXTENSION EVENT', event)
    })

    const extensions = this.extensionHandler.setupExtensions(extensionDefinitions, owner)
    this.extensions.push(...extensions)
    const loadPromises = this.extensions.map(extension => extension.load(true))
    await Promise.all(loadPromises)
    return extensions
  }
}
