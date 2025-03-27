import ExtensionHandler, { type ExtensionStructure } from '../../ExtensionHandler.ts'
import ExtensionLogger from '../../ExtensionLogger.ts'
import {
  Extension,
  type ExtensionDependency,
  ExtensionDependencyType,
  type ResolvedExtensionDependency
} from '../../Extension.ts'
import Service, { inject as service } from '@ember/service'
import { tracked } from '@glimmer/tracking'
import { hash } from 'rsvp'
import { action } from '@ember/object'
import type ExtensionEventsService from './extension-events.ts'
import type PeekExtensionsAPIService from './extensions-api.ts'

export const WINDOW_SCRIPT_LOAD_EVENT = 'extension-main-script-loaded'

export default abstract class ExtensionHandlerService extends Service {
  @service('extension-events') extensionEvents!: ExtensionEventsService
  @service('extensions-api') extensionsAPI!: PeekExtensionsAPIService

  @tracked activeExtensions: Extension[] = []
  @tracked extensionImports: ExtensionDependency[] = []
  @tracked importedGenericDependencyID: number = 0

  // ATTENTION:
  // these 2 methods should be overwritten by any FE ember app that is implementing this dependency
  dynamicallyImportLocalDependency (importObject: ExtensionDependency): Promise<ResolvedExtensionDependency> {
    return new Promise((resolve, reject) => {
      // import(`peek-extensions-framework-test/${importObject.url}.js`).then((module: { default: Function }) => {
      //   resolve({
      //     type: importObject.type,
      //     isMainScript: importObject.isMainScript ?? false,
      //     module
      //   })
      // }).catch(error => {
      //   console.error('IMPORT ERROR', error)
      //   reject(error)
      // })
    })
  }

  // ATTENTION:
  // these 2 methods should be overwritten by any FE ember app that is implementing this dependency
  dynamicallyImportLocalWebComponents (importObject: ExtensionDependency): Promise<ResolvedExtensionDependency> {
    return new Promise((resolve, reject) => {
      import('peek-extensions-framework-test/components').then((module: { default: Function }) => {
        resolve({
          type: importObject.type,
          isMainScript: importObject.isMainScript ?? false,
          module
        })
      }).catch(error => {
        console.error('IMPORT ERROR', error)
        reject(error)
      })
    })
  }

  /**
   * sets up a single extension for a given owner
   * @param extension
   * @param owner
   */
  setupExtension (extension: ExtensionStructure, owner: object): Extension {
    if (!owner) {
      throw new Error('Ember - Service::ExtensionHandler::setupExtension(): owner is required to load extension', {
        cause: extension
      })
    }

    const newExtension = ExtensionHandler.setupExtension(
      extension.name,
      owner,
      this.extensionEvents.sendEvent,
      this.extensionEvents.subscribeToAppEvent,
      this.loadExtensionImports,
      this.extensionsAPI.getAPIProxy(this.logsEnabled()),
      extension.data,
      this.logsEnabled()
    )
/**/
    this.activeExtensions.push(newExtension)

    ExtensionLogger.log('EMBER - Service::ExtensionHandler::setupExtension() - new extension set up:', newExtension)

    return newExtension
  }

  /**
   * sets up multiple extensions for a given owner
   * @param extensions
   * @param owner
   */
  setupExtensions (extensions: ExtensionStructure[] = [], owner: object): Extension[] {
    if (!owner) {
      throw new Error('Ember - Service::ExtensionHandler::setupExtension(): owner is required to load extensions', {
        cause: extensions
      })
    }

    const newExtensions: Extension[] = []

    extensions.forEach(extension => {
      newExtensions.push(
        ExtensionHandler.setupExtension(
          extension.name,
          owner,
          this.extensionEvents.sendEvent,
          this.extensionEvents.subscribeToAppEvent,
          this.loadExtensionImports,
          this.extensionsAPI.getAPIProxy(this.logsEnabled()),
          extension.data,
          this.logsEnabled()
        )
      )
    })

    this.activeExtensions.push(...newExtensions)

    ExtensionLogger.log('EMBER - Service::ExtensionHandler::setupExtensions() - new extensions set up:', newExtensions)

    return newExtensions
  }

  /**
   * returns all registered extensions for a given owner
   * @param owner
   */
  getRegisteredExtensions (owner: object): Extension[] {
    return ExtensionHandler.getRegisteredExtensions(owner)
  }

  /**
   * returns a boolean that indicates if a given extension is registered for a given owner
   * @param owner
   * @param extension
   */
  isRegisteredExtension (owner: object, extension: Extension): boolean {
    return ExtensionHandler.isRegisteredExtension(owner, extension)
  }

  /**
   * removes all extensions for a given owner
   * @param owner
   */
  removeExtensions (owner: object): void {
    ExtensionHandler.removeRegisteredExtensions(owner)
  }

  /**
   * dynamically imports extension dependencies and returns back a promise hash with all the loaded modules
   * using @action to avoid "this" context value getting messed up by Extension class instances
   * @param imports
   * @returns { [moduleName: module] }
   */
  @action
  protected loadExtensionImports (imports: ExtensionDependency[] = []): Promise<{ [key: string]: ResolvedExtensionDependency }> {
    if (!imports || imports.length === 0) {
      return new Promise((resolve) => {
        resolve({})
      })
    }

    const importPromises: { [key: string]: ResolvedExtensionDependency } = {}

    imports.forEach((importObject: ExtensionDependency) => {
      const { type, name, url } = importObject
      let importPromise, importName
      importName = `${type}-${url}`

      if (name) {
        importName = name
      }

      if (type === ExtensionDependencyType.WEB_COMPONENT) {
        importPromise = this.importWebComponent(importObject)
      } else if (type === ExtensionDependencyType.DEPENDENCY) {
        importPromise = this.importLocalDependency(importObject)
      } else if (url && name) {
        importPromise = this.importGenericDependency(importObject)
      }

      // @ts-expect-error importPromise is not undefined
      importPromises[importName] = importPromise
    })

    return hash(importPromises).then((importedModules = {}) => {
      ExtensionLogger.log('EMBER - Service::ExtensionHandler::loadExtensionImports() - imports loaded:', importedModules)
      return importedModules
    }).catch((error: object) => {
      ExtensionLogger.logError('Ember - Service::ExtensionHandler::loadExtensionImports(): error while trying to load imports', error)
      throw new Error('Ember - Service::ExtensionHandler::loadExtensionImports(): error while trying to load imports', {
        cause: error
      })
    })
  }

  /**
   * imports the entire web-component bundle from the extensions package using ember-auto-import
   * @param importObject
   * @protected
   */
  protected importWebComponent (importObject: ExtensionDependency): Promise<ResolvedExtensionDependency> {
    return this.dynamicallyImportLocalWebComponents(importObject)
  }

  /**
   * imports a local dependency from the extensions package using ember-auto-import
   * @param importObject
   * @protected
   */
  protected importLocalDependency (importObject: ExtensionDependency): Promise<ResolvedExtensionDependency> {
    return this.dynamicallyImportLocalDependency(importObject)
  }

  /**
   * NOTE/WARNING: this is a complex process, pay close attention!
   *
   * imports a generic external dependency as a script tag
   * it also imports the default function from the dependency to get a reference to that same default function
   * we're prefetching the main script to use browser cache, then we try to add a new script tag to the document
   * @param importObject
   * @protected
   */
  protected importGenericDependency (importObject: ExtensionDependency): Promise<ResolvedExtensionDependency> {
    const { url, isMainScript } = importObject
    const { type, async, defer } = importObject.scriptConfig ?? {}

    return new Promise<ResolvedExtensionDependency>((resolve, reject) => {
      const now = Date.now()

      // if the main script is an external dependency, we need to prefetch it first
      // then, look for the run() function and add it to window so we can reference it later
      // after all is loaded, we'll resolve the promise with the module, referencing the window code
      // we added earlier from the extension, finally we clean up window
      if (isMainScript) {
        const extensionMainScriptURL = `${url}?v=${now}`
        // prefetch the script using another script tag, this way we only try to use the main script
        // after its loaded and ready to run, using script.onload
        const prefetchScript = document.createElement('script')
        prefetchScript.src = extensionMainScriptURL
        prefetchScript.type = 'module'
        document.head.appendChild(prefetchScript)

        prefetchScript.onload = () => {
          // as many JS files can be loaded simultaneously, we need to listen to the right event
          // to get the run() reference, so we mark each event with an incremental number
          // to avoid colliding between the same event names
          this.importedGenericDependencyID++
          const script = document.createElement('script')
          script.type = 'module'

          // we're adding a script that dynamically imports the main script "run()"
          // then triggers an event to let the extension-handler know the script is loaded
          // and can be used. This will run as soon as the script is added to the document.head
          script.innerHTML = `
                import run from '${extensionMainScriptURL}'

                const event = new CustomEvent('${WINDOW_SCRIPT_LOAD_EVENT}-${this.importedGenericDependencyID}', {
                  detail: {
                    run
                  }
                })

               window.dispatchEvent(event)
              `

          document.head.appendChild(script)

          const onLoadExtensionScript = (event: { detail: { run: Function } }): void => {
            resolve({
              type: importObject.type,
              isMainScript: true,
              module: {
                default: event.detail.run
              }
            })

            // @ts-expect-error event is valid
            window.removeEventListener(`${WINDOW_SCRIPT_LOAD_EVENT}-${this.importedGenericDependencyID}`, onLoadExtensionScript)
          }

          // @ts-expect-error event is valid
          window.addEventListener(`${WINDOW_SCRIPT_LOAD_EVENT}-${this.importedGenericDependencyID}`, onLoadExtensionScript)
        }

        // @ts-expect-error error has the right type
        prefetchScript.onerror = (error: ErrorEvent) => {
          reject({
            error: `Ember - Service::ExtensionHandler::loadExtensionImports(): error while trying to prefetch script: ${url}`,
            cause: {
              error,
              importObject
            }
          })
        }
      } else {
        const script = document.createElement('script')
        script.src = url ?? ''

        // these are attributes for the <script> tag, presence of these attrs can alter how we load the script
        // that's why we're using if conditionals instead of "script.async = async ?? false"
        // to make sure we're not setting the attribute if it's not present
        if (type) {
          script.type = type
        }

        if (async) {
          script.async = true
        }

        if (defer) {
          script.defer = true
        }

        script.onload = () => {
          resolve({
            type: importObject.type,
            isMainScript: false,
            script
          })
        }

        // @ts-expect-error error has the right type
        script.onerror = (error: ErrorEvent) => {
          reject({
            error: `Ember - Service::ExtensionHandler::loadExtensionImports(): error while trying to load script: ${url}`,
            cause: {
              error,
              importObject
            }
          })
        }

        document.head.appendChild(script)
      }
    })
  }

  log (message: string, ...info: unknown[]): void {
    ExtensionLogger.log(message, ...info)
  }

  logError (message: string, ...info: unknown[]): void {
    ExtensionLogger.logError(message, ...info)
  }

  // set "extensionLogs" query param to enable verbose logging for extensions
  protected logsEnabled (): boolean {
    try {
      return new URLSearchParams(window.location.search).get('extensionLogs') === 'true' || false
    } catch (error) {
      ExtensionLogger.logError('Ember - Service::ExtensionHandler::logsEnabled(): error while checking if logs are enabled', error)
      return false
    }
  }
}
