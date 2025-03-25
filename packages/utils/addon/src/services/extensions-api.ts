import Service, { inject as service } from '@ember/service'
import Route from '@ember/routing/route'
import Transition from '@ember/routing/-private/transition'
import LegacyModalHandlerService, {
  LegacyModalHandlerEventName,
  LegacyModalMessageData
} from '@peek/client/services/legacy-modal-handler'
import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'
import ExtensionStyles from 'peek-extensions-utils-test/ExtensionStyles'
import gql from 'graphql-tag'
import { Extension, type PeekExtensionsAPI } from 'peek-extensions-utils-test/Extension'
import { action } from '@ember/object'
import { getOwner } from '@ember/application'
import { tracked } from '@glimmer/tracking'
import { extendable, extendableProperties } from '@peek/client/decorators/extendable'
import { broadcastToExtensions } from '@peek/client/decorators/broadcast-to-extensions'
import { DocumentNode, FetchPolicy } from '@apollo/client/core'
import { ApolloQueryResult, TypedDocumentNode } from '@apollo/client'
import { useQuery, useMutation } from 'glimmer-apollo'

/**
 * methods from this service needs to be declared as @action so context its bound correctly
 * OR use .bind(this) when referencing local methods
 * other services functions should also be bound, so those functions can target respective services correctly
 * as "this" = this service
 */
export default class PeekExtensionsAPIService extends Service {
  @service declare toastNotification: ToastNotificationService
  @service declare router: Route
  @service declare legacyModalHandler: LegacyModalHandlerService

  // DO NOT REMOVE THESE @extendable/@broadcastToExtensions properties
  // this is for our text-extension-test.js suite
  @tracked _testNonExtendableProperty = 'this text should not be accessible'
  @tracked @extendable _testExtendableProperty = 'this text is assigned on extensions-api service'
  @tracked exampleArray: string[] = ['this', 'is', 'an', 'example', 'array']

  @broadcastToExtensions
  get arrayToBroadcast (): string[] {
    return this.exampleArray
  }

  @broadcastToExtensions({ disabled: true, disableForInstallIdList: ['disabeld-extension-id'] })
  get arrayWithBroadcastDisabled (): string[] {
    return this.exampleArray
  }

  @broadcastToExtensions({ disabled: true, disableForInstallIdList: ['disabeld-extension-id'] })
  get arrayWithBroadcastDisabledById (): string[] {
    return this.exampleArray
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
        redirectTo: this.redirectTo.bind(this),
        showToast: this.showToast.bind(this),
        openLegacyModal: this.openLegacyModal.bind(this),
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
      apolloGql: {
        gqlStringWrapper: gql,
        query: this.apolloQuery.bind(this),
        mutation: this.apolloMutation.bind(this)
      },
      constants: {
        LegacyModalHandlerEventName
      }
    }
  }

  log (message: string, ...info: unknown[]): void {
    ExtensionLogger.log(message, ...info)
  }

  logError (message: string, ...info: unknown[]): void {
    ExtensionLogger.logError(message, ...info)
  }

  openLegacyModal (callerExtension: Extension, actionType: LegacyModalHandlerEventName, data: LegacyModalMessageData = {}): void {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::openLegacyModal(): opening legacy modal', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })
    // eslint-disable-next-line no-useless-call
    return this.legacyModalHandler.openLegacyModal.call(this.legacyModalHandler, actionType, data)
  }

  redirectTo (callerExtension: Extension, route: string): Transition<unknown> {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::redirectTo(): redirecting', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })
    return this.router.transitionTo(route)
  }

  showToast (callerExtension: Extension, message: string, type: string): void {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::showToast(): showing toast', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })
    this.toastNotification.show(message, type)
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

    const service = getOwner(this).lookup(`service:${serviceName}`)

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

  /**
   * Executes a query using Apollo Client
   * @param callerExtension
   * @param query
   * @param variables
   * @returns Promise<ApolloQueryResult>
   */
  apolloQuery (callerExtension: Extension, query: DocumentNode | TypedDocumentNode<never, Object>, variables: Object): Promise<ApolloQueryResult<unknown>> | undefined {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::apolloQuery - Extension called Apollo Query', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })

    const options = {
      fetchPolicy: 'no-cache' as FetchPolicy,
      variables
    }

    const queryObject = useQuery(this, () => [
      query,
      { ...options }
    ])

    return queryObject.refetch()
  }

  /**
   * Executes a mutation using Apollo Client
   * @param callerExtension
   * @param mutation
   * @param variables
   * @returns Promise<ApolloMutationResult>
   */
  apolloMutation (callerExtension: Extension, mutation: DocumentNode | TypedDocumentNode<never, Object>, variables: Object): Promise<unknown> | undefined {
    ExtensionLogger.log('Ember - Service::ExtensionsAPI::apolloMutation - Extension called Apollo Mutation', {
      caller: callerExtension,
      arguments: {
        ...arguments
      }
    })

    const options = {
      variables
    }

    const mutationObject = useMutation(this, () => [
      mutation,
      { ...options }
    ])

    return mutationObject.mutate()
  }
}
