import {
  type EventData,
  Extension,
  type ExtensionData,
  type ExtensionDependency,
  ExtensionStatus,
  type PeekExtensionsAPI
} from '../Extension.ts'

export interface GenericExtensionData extends ExtensionData {
  /**
   * DOM selector, if present, the extension will wait for the selector to be present
   * on the DOM before calling run()
   */
  runOnSelector?: string
}

export default class GenericExtension extends Extension {
  override name: string = 'GenericExtension'
  override extensionData: GenericExtensionData
  mutationObserver?: MutationObserver | undefined
  urlMutationObserver?: MutationObserver | undefined
  pendingRun?: Promise<void> | boolean

  constructor (
    sendEventToApp: (eventData: EventData) => void,
    listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void,
    loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>,
    extensionsAPI: PeekExtensionsAPI,
    extensionData: GenericExtensionData
  ) {
    super(sendEventToApp, listenToAppEvent, loadImports, extensionsAPI, extensionData)

    this.extensionData = extensionData
  }

  async load (autoRun: boolean = true): Promise<void> {
    // checks for any web component element present on the HTML
    try {
      if (this.hasDependenciesToImport) {
        await this.importDependencies(this.dependencyList)
      }

      this.dispatchEventToApp({
        eventName: `${this.name}Loaded`
      })

      if (autoRun) {
        void this.run()
      }
    } catch (error) {
      this.status = ExtensionStatus.ERROR
      throw error
    }
  }

  override run (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.hasError) {
        this.logError(`${this.name}: error(s) detected, cannot run`, { errors: this.errors })
        reject(this.errors)
      }


      // no need to watch URL changes if the extension is tied to a global scoped component like authenticated
      // route or a global component (top-bar, side-nav, etc)
      if (!this.extensionData.isGlobalScope) {
        this.startUrlObserver()
      }

      if (this.extensionData.runOnSelector) {
        const targetElement = document.querySelector(this.extensionData.runOnSelector) ?? undefined

        if (targetElement) {
          const result = super.run()
          this.pendingRun = result
          resolve(result)
        }

        try {
          resolve(this.startMutationObserverOnHTML())
        } catch (e) {
          reject(e)
        }
      } else {
        resolve(super.run())
      }

      this.status = ExtensionStatus.READY

      this.dispatchEventToApp({
        eventName: `${this.name}Ready`
      })
    })
  }

  async unload (): Promise<void> {
    this.status = ExtensionStatus.INIT

    this.urlMutationObserver?.disconnect()
    this.urlMutationObserver = undefined
    this.mutationObserver?.disconnect()
    this.mutationObserver = undefined

    return new Promise((resolve) => {
      resolve()
    })
  }

  /**
   * setups a mutationObserver to watch over targetSelector
   *
   * NOTE: the observer will disconnect itself as soon as the targetElement is found and adding HTML to
   * the app DOM, otherwise it will trigger again after the app's HTML is updated due to how
   * mutationObserver works
   * @private
   */
  private startMutationObserverOnHTML (): Promise<void> | undefined {
    if (this.pendingRun) {
      return undefined
    }

    this.pendingRun = new Promise<void>((resolve, reject): void => {
      try {
        this.mutationObserver?.disconnect()

        this.mutationObserver = new MutationObserver((_mutationList) => {
          const targetElementSelector = this.extensionData?.runOnSelector
          const targetElement = targetElementSelector && document.querySelector(targetElementSelector) as HTMLElement
          const targetElementIsVisible = targetElement && targetElement?.offsetParent !== null

          // if we find the element, we run the extension
          if (targetElementIsVisible) {
            targetElement.setAttribute('data-extension-run', this.uniqId)
            this.logMessage(`${this.name}: HTML target object found! running extension...`, targetElement)
            resolve(this.run())

            this.dispatchEventToApp({
              eventName: `${this.name}TargetElementFound`,
              targetElement
            })
          } else {
            this.logMessage(`${this.name}: HTML target object not found or not visible`, { targetElementSelector })
          }
        })

        this.logMessage(`${this.name}: setting up DOM observer`, { mutationObserver: this.mutationObserver })

        this.mutationObserver.observe(document.body, { subtree: true, childList: true })
      } catch (e) {
        this.logError(`${this.name}: Something failed while running extension`, { error: e })
        reject()
      }
    }).finally(() => {
      // whether the extension runs or not, we disconnect the observer
      this.logMessage(`${this.name}: extension ran, disconnecting observer...`)
      this.pendingRun = undefined
      this.mutationObserver?.disconnect()
    })

    return this.pendingRun
  }

  /**
   * setups a mutationObserver to watch for URL changes and restart the mutationObserver on the HTML
   * and starts DOM observation
   * @private
   */
  private startUrlObserver (): void {
    this.urlMutationObserver?.disconnect()
    let lastURL = this.extensionData.observeQueryParams
      ? window.location.href
      : window.location.href.split('?')[0]

    this.urlMutationObserver = new MutationObserver(() => {
      const currentURL = this.extensionData.observeQueryParams
        ? window.location.href
        : window.location.href.split('?')[0]

      // whenever URL changes, we restart the HTML mutationObserver until element is found
      if (currentURL !== lastURL) {
        this.logMessage(`${this.name}: URL change detected`, {
          lastURL,
          currentURL
        })

        lastURL = currentURL

        this.urlMutationObserver?.disconnect()
        this.urlMutationObserver = undefined
        this.mutationObserver?.disconnect()
        this.mutationObserver = undefined
        this.pendingRun = undefined
        void this.run()
      }
    })

    this.logMessage(`${this.name}: setting up URL observer`, { mutationObserver: this.urlMutationObserver })

    this.urlMutationObserver.observe(document.body, { subtree: true, childList: true })
  }
}
