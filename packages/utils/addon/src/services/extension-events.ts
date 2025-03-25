import Service from '@ember/service'
import Evented from '@ember/object/evented'
import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'
import { action } from '@ember/object'
import { tracked } from '@glimmer/tracking'
import { type EventData, Extension } from 'peek-extensions-utils-test/Extension'

export const ExtensionEventNames = {
  EXTENSION_UPDATE: 'extensionUpdate'
}

/**
 * example event subscription for Ember:
 *
 * 1- Inject service on ember side:
 * @service('extensions/extension-events') extensionEvents
 *
 * 2- Subscribe to event on ember side
 * this.extensionEvents.subscribeToExtensionEvent('SHOULD-MATCH', (message: unknown, data: unknown) => {
 *   console.log(this, message, data)
 * })
 *
 * 3- Send event from extension
 * this.dispatchEventToPeek({
 *         eventName: 'SHOULD-MATCH', // this event name should match on the ember side
 *         data: { message: 'This event comes from extension code!' }
 *       })
 */
export default class ExtensionEventsService extends Service.extend(Evented) {
  @tracked subscribedExtensionEvents = new Map()
  @tracked subscribedAppEvents = new Map()

  /**
   * send an event to all subscribers, this is being called from inside Extensions classes
   * we pass this function ref to Extension class instances when we set them up
   * @param message
   */
  @action
  sendEvent (message: EventData = {}): void {
    ExtensionLogger.log('Ember - Service::ExtensionEvents::sendEvent(): received message', message)
    const eventName = message.eventName ?? ExtensionEventNames.EXTENSION_UPDATE
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.trigger(eventName, message)
  }

  /**
   * subscribe to extension events from any Ember construct
   * @param eventName
   * @param handler
   */
  @action
  subscribeToExtensionEvent (eventName: string = ExtensionEventNames.EXTENSION_UPDATE, handler: (event: Event) => void): void {
    // only subscribe if event is not already subscribed with the same handler
    if (!this.subscribedExtensionEvents.has(eventName)) {
      this.subscribedExtensionEvents.set(eventName, handler)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.on(eventName, (event: Event) => {
        handler(event)
      })
    }
  }

  /**
   * used to subscribe to app events from extensions code
   * @param extensionListening
   * @param eventName
   * @param handler
   */
  @action
  subscribeToAppEvent (extensionListening: Extension, eventName: string, handler: (event: Event) => void): void {
    const handlerObject = {
      extensionListening,
      handler
    }

    if (!this.subscribedAppEvents.has(eventName)) {
      this.subscribedAppEvents.set(eventName, [handlerObject])
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const existingHandlers = this.subscribedAppEvents.get(eventName)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.subscribedAppEvents.set(eventName, [...existingHandlers, handlerObject])
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.on(eventName, (event: Event) => {
      handler(event)
    })
  }
}
