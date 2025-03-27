import Service, { inject as service } from '@ember/service'
import type ExtensionHandlerService from './extension-handler.ts'
import type ExtensionEventsService from './extension-events.ts'
import { ExtensionEventNames } from './extension-events.ts'
import { type ExtensionStructure } from '../../ExtensionHandler.ts'
import { tracked } from '@glimmer/tracking'
import { Extension } from '../../Extension.ts'

export default class ExtensionLoaderService extends Service {
  @service('extension-handler') declare extensionHandler: ExtensionHandlerService
  @service('extension-events') declare extensionEvents: ExtensionEventsService

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
