import Service, { inject as service } from '@ember/service'
import Route from '@ember/routing/route'
import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'
import ExtensionStyles from 'peek-extensions-utils-test/ExtensionStyles'
import { Extension, type PeekExtensionsAPI } from 'peek-extensions-utils-test/Extension'
import { action } from '@ember/object'
import { getOwner } from '@ember/application'
import { tracked } from '@glimmer/tracking'
import { extendable, extendableProperties } from 'peek-extensions-utils-test/decorators/extendable'
import { broadcastToExtensions } from 'peek-extensions-utils-test/decorators/broadcast-to-extensions'

/**
 * methods from this service needs to be declared as @action so context its bound correctly
 * OR use .bind(this) when referencing local methods
 * other services functions should also be bound, so those functions can target respective services correctly
 * as "this" = this service
 */
export default class PeekExtensionsAPIService extends Service {
  // DO NOT REMOVE THESE @extendable/@broadcastToExtensions properties
  // this is for our text-extension-test.js suite
  @tracked _testNonExtendableProperty = 'this text should not be accessible'
  @tracked @extendable _testExtendableProperty = 'this text is assigned on extensions-api service'
  @tracked exampleArray: string[] = ['this', 'is', 'an', 'example', 'array']
  @tracked exampleArrayForMethod: string[] = ['this', 'is', 'an', 'example', 'array', 'for', 'methods']

  @broadcastToExtensions
  get arrayToBroadcast (): string[] {
    return this.exampleArray
  }

  @broadcastToExtensions({ disabled: true })
  get arrayWithBroadcastDisabled (): string[] {
    return this.exampleArray
  }

  @broadcastToExtensions({ disableForInstallIdList: ['disabled-extension-id'] })
  get arrayWithBroadcastDisabledById (): string[] {
    return this.exampleArray
  }

  @action
  @broadcastToExtensions
  testMethod (value1: string, value2: string): string[] {
    this.exampleArrayForMethod.push(value1, value2)
    return this.exampleArrayForMethod
  }

  @action
  @broadcastToExtensions
  testMethodPromise (): Promise<string[]> {
    return new Promise((resolve) => {
      resolve(this.exampleArrayForMethod)
    })
  }
  // END DO NOT REMOVE

  // to avoid giving access to the service instance, we provide a proxy with only the methods we want to expose
  // to extensions code. NOTE: Be sure to use .bind(this/externalService) to correctly bind context
  @action
  getAPIProxy (logsEnabled: boolean = false): PeekExtensionsAPI {
    if (!ExtensionLogger.enabled && logsEnabled) {
      ExtensionLogger.enabled = logsEnabled
    }

    return {
      methods: {
        invokeLookup: this.invokeLookup.bind(this)
      },
      styles: {
        customProperties: ExtensionStyles.availableCSSCustomProperties,
        setCSSCustomProperty: ExtensionStyles.setCSSCustomProperty.bind(ExtensionStyles)
      },
      logger: {
        log: this.log.bind(this),
        logError: this.logError.bind(this)
      },
      apolloGql: {},
      constants: {}
    }
  }

  log (message: string, ...info: unknown[]): void {
    ExtensionLogger.log(message, ...info)
  }

  logError (message: string, ...info: unknown[]): void {
    ExtensionLogger.logError(message, ...info)
  }

  /**
   * returns a proxy for a service instance, allowing access to only attrs/methods marked with @extendable
   * - attrs: those are allowed to be accessed directly by extensions
   * - methods: as some methods can use "this.attrA" internally, and attrA could not be @extendable, we provide direct
   *    access to methods, but we bind the service to the method, so it can access the target's service attrs/methods
   * @param callerExtension
   * @param serviceName
   * @returns Proxy(service)
   */
  invokeLookup (callerExtension: Extension, serviceName: string): unknown {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::invokeLookup(): invoking Ember lookup from extension', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })

    // @ts-expect-error this is never undefined
    const service = getOwner(this).lookup(`service:${serviceName}`)

    if (!service) {
      ExtensionLogger.logError(`Ember - Service::ExtensionsAPI::invokeLookup - Service "service:${serviceName}" not found.`, {
        caller: callerExtension,
        arguments: {
          ...arguments
        }
      })

      return
    }

    // this proxy only allows "get" access to @extendable properties/methods
    // but won't "set" unless we define a setter for properties
    return new Proxy(
      service,
      {
        get (target: Service, prop: string, receiver: unknown) {
          // Check if the property/method is marked with @extendable
          const isExtendable = extendableProperties.get(target.constructor.name)?.has(prop)

          if (isExtendable) {
            // if it's a method, we just bind the service the extension is referencing and
            // return the method back to the extension
            // @ts-expect-error as target: Service, target[prop] is invalid by TS, but it's 100% valid
            const targetProp = target[prop]
            if (typeof targetProp === 'function') {
              return targetProp.bind(target)
            }

            // if it's an attribute, we allow the extension to access it
            return Reflect.get(target, prop, receiver)
          }

          // log an error if the property/method is not extendable
          ExtensionLogger.logError(`Ember - Service::ExtensionsAPI::invokeLookup - Access to ${prop} is restricted. Use the @extendable decorator to expose it.`, {
            caller: callerExtension,
            arguments: {
              ...arguments
            }
          })
        }
      }
    )
  }
}
