import { decoratorWithParams } from '@ember-decorators/utils/decorator'
import { debounce } from '@ember/runloop'
import { getOwner } from '@ember/application'
import ExtensionEventsService from '../services/extensions/extension-events.ts'
import ExtensionHandlerService from '../services/extensions/extension-handler.ts'
import { Extension } from '../Extension.ts'

export interface BroadcastToExtensionsParams {
  disabled?: boolean
  disableForInstallIdList?: string[]
  disableForAccountIdList?: string[]
}

/**
 * implements a decorator @broadcastToExtensions that will broadcast changes to the value of a getter
 * or method return statements to extensions that subscribe to
 * `${target.constructor.name}.${variable}.update` event
 *
 * Usage:
 *  1. Add @broadcastToExtensions to a getter/computed/tracked property in a component or controller
 *  @broadcastToExtensions({ options })
 *  get myVariable ()
 *
 *  2. Use
 *    this.subscribeToAppEvent('ClassName.myVariable.update', (event) => {
 *      console.log('ClassName. updated!', event)
 *    })
 *   in an extension to listen to the event
 */
export const broadcastToExtensions = decoratorWithParams((
  target: { [key: string]: string },
  key: string,
  descriptor: { get: Function, value: Function },
  params: BroadcastToExtensionsParams[] = []
) => {
  if (!descriptor.get && !descriptor.value) {
    throw new Error('@broadcastToExtensions can only be used on values that can be read or invoked/called.')
  }

  // store original getter (get) and function call (value)
  const originalGetter = descriptor.get
  const originalValue = descriptor.value

  if (originalGetter) {
    // Create a private tracked property to store the getter's value
    const privateKey = `_${key}`

    // override original getter to broadcast if change is detected, otherwise it just returns as the regular getter
    descriptor.get = function () {
      // @ts-expect-error for this[privateKey]
      const previousValue = this[privateKey]
      // @ts-expect-error for this[privateKey]
      this[privateKey] = originalGetter.call(this)
      // @ts-expect-error for this[privateKey]
      const currentValue = this[privateKey]

      // if we detect a change, broadcast that change
      if (previousValue !== currentValue) {
        const decoratorParams: BroadcastToExtensionsParams = params.length > 0 ? params[0] as BroadcastToExtensionsParams : {}
        debounce(this, broadcastChange, target, decoratorParams, this, key, currentValue, 200)
      }

      return currentValue
    }
  }

  // for methods, we get the result from the original method, broadcast that result, and return it
  if (originalValue) {
    descriptor.value = function () {
      const result = originalValue.call(target, ...arguments)
      const decoratorParams: BroadcastToExtensionsParams = params.length > 0 ? params[0] as BroadcastToExtensionsParams : {}
      debounce(this, broadcastChange, target, decoratorParams, this, key, result, 200)
      return result
    }
  }

  return descriptor
}, 'broadcastToExtensions')

/**
 * this method will be called when a change is detected on the getter override below
 * @param target
 * @param decoratorParams
 * @param instance
 * @param variable
 * @param value
 */
const broadcastChange = (
  target: Object,
  decoratorParams: BroadcastToExtensionsParams,
  instance: Object,
  variable: string,
  value: unknown
): void => {
  const extensionHandlerService = getOwner(instance)?.lookup('service:extensions/extension-handler') as ExtensionHandlerService

  if (!extensionHandlerService) {
    throw new Error('@broadcastToExtensions cannot find "service:extensions/extension-events" service via getOwner().')
  }

  // check if global kill-switch is ON, if so we should not trigger events for this decorator instance
  if (decoratorParams?.disabled) {
    extensionHandlerService.logError(`@broadcastToExtensions on ${target.constructor.name}.${variable} is disabled by decorator params.`)
    return
  }

  const extensionEventsService = getOwner(instance)?.lookup('service:extensions/extension-events') as ExtensionEventsService

  if (!extensionEventsService) {
    throw new Error('@broadcastToExtensions cannot find "service:extensions/extension-events" service via getOwner().')
  }

  const handlerObjects: { extensionListening: Extension, handler: Function }[] = extensionEventsService.subscribedAppEvents.get(
    `${target.constructor.name}.${variable}.update`
  )

  if (handlerObjects?.length > 0) {
    handlerObjects.forEach((handlerObject: { extensionListening: Extension, handler: Function }) => {
      // check decorator's params in case there's a kill-switch enabled to avoid broadcasting changes
      const isDisabled = checkIfDisabled(decoratorParams, handlerObject.extensionListening)

      if (isDisabled) {
        extensionHandlerService.logError(`@broadcastToExtensions on ${target.constructor.name}.${variable} is disabled by decorator params for this extension.`, {
          handlerObject,
          decoratorParams
        })
      } else {
        extensionHandlerService.log(`@broadcastToExtensions on ${target.constructor.name}.${variable}: Broadcasting update`, {
          handlerObject,
          decoratorParams
        })

        handlerObject.handler({
          // to debug extensions that uses this event, search for "ComponentClassName.variableName.update"
          // in the extension code
          eventName: `${target.constructor.name}.${variable}.update`,
          data: {
            variable,
            value
          }
        })
      }
    })
  }
}

/**
 * checks whether an extension is disabled by decorator params (disableForInstallIdList array) or not
 * @param decoratorParams
 * @param extensionListening
 */
const checkIfDisabled = (
  decoratorParams: BroadcastToExtensionsParams,
  extensionListening: Extension
): boolean => {
  if (!decoratorParams) {
    return false
  }

  if (decoratorParams.disabled) {
    return true
  }

  let isDisabled = false

  const extensionData = extensionListening.extensionData

  if (!extensionData) {
    isDisabled = true
  }

  if (extensionData?.installId) {
    const disableForInstallIdList = decoratorParams?.disableForInstallIdList ?? []
    isDisabled = disableForInstallIdList.includes(extensionData.installId)
  }

  return isDisabled
}
