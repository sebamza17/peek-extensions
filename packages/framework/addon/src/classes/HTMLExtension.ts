import {
  type EventData,
  Extension,
  type ExtensionData,
  type ExtensionDependency, ExtensionDependencyType,
  ExtensionStatus,
  type PeekExtensionsAPI,
  type ResolvedExtensionDependency
} from '../Extension.ts'

export interface HTMLExtensionData extends ExtensionData {
  /**
   * html content to render
   */
  html: string

  /**
   * target selector to inject the HTML content
   */
  targetSelector?: string
}

/**
 * extension to support external HTML content
 * NOTE: manually call load() whenever you KNOW the DOM is ready, otherwise this extension won't find a valid targetElement
 */
export default class HTMLExtension extends Extension {
  override name: string = 'HTMLExtension'
  declare extensionData: HTMLExtensionData
  targetElement?: Element
  targetElementUpdated: boolean = false
  mutationObserver?: MutationObserver
  urlMutationObserver?: MutationObserver

  constructor (
    sendEventToApp: (eventData: EventData) => void,
    listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void,
    loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>,
    extensionsAPI: PeekExtensionsAPI,
    extensionData: HTMLExtensionData
  ) {
    super(sendEventToApp, listenToAppEvent, loadImports, extensionsAPI, extensionData)
    this.extensionData = extensionData

    if (!extensionData.targetSelector) {
      this.logError(`${this.name}: targetSelector is required`)
      return
    }
  }

  get isWebComponent (): boolean {
    return Object.values(this.dependencies)
      .some((dependency: ResolvedExtensionDependency) => dependency.type === ExtensionDependencyType.WEB_COMPONENT)
  }

  async load (autoRun: boolean = false): Promise<void> {
    try {
      if (this.hasDependenciesToImport) {
        await this.importDependencies(this.dependencyList)
      }

      try {
        // checks for any web component element present on the HTML
        await this.importWebComponents(this.extensionData.html)
      } catch (e) {
        this.logError(`${this.name}: Error importing web components`, { error: e })
      }

      this.dispatchEventToApp({
        eventName: `${this.name}Loaded`
      })

      if (autoRun) {
        return this.run()
      }
    } catch (error) {
      this.status = ExtensionStatus.ERROR
      throw error
    }
  }

  async unload (): Promise<void> {
    this.status = ExtensionStatus.INIT

    return new Promise((resolve) => {
      resolve()
    })
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

      this.targetElement = document.querySelector(this.extensionData.targetSelector!) ?? undefined

      if (this.targetElement) {
        this.targetElement.innerHTML = this.extensionData.html

        if (this.isWebComponent) {
          this.writePublicAPIOnWebComponents()
        }
      } else {
        this.startMutationObserverOnHTML()
      }

      this.status = ExtensionStatus.READY

      this.dispatchEventToApp({
        eventName: `${this.name}Ready`
      })

      resolve(super.run())
    })
  }

  /**
   * manually selects from the DOM inside targetElement and assigns a reference to the public API
   * to each web-component found
   * @private
   */
  private writePublicAPIOnWebComponents () {
    if (!this.targetElement) {
      return
    }

    const webComponents = this.targetElement.querySelectorAll('[data-extension-web-component]')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webComponents.forEach((webComponent: any) => {
      webComponent._peekExtensionsAPI = this.peekExtensionsAPI
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
  private startMutationObserverOnHTML (): void {
    let timeoutStarted = false
    let timeout: number = 0

    try {
      this.mutationObserver = new MutationObserver((_mutationList, observer) => {
        const targetElement = document.querySelector(this.extensionData.targetSelector!) ?? false

        // as soon as we find the targetElement, disconnect the observer and write the extension HTML on the DOM
        if (targetElement) {
          observer.disconnect()
          this.targetElement = targetElement

          if (!timeoutStarted) {
            timeoutStarted = true

             if (timeout) {
               clearTimeout(timeout)
             }

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            timeout = setTimeout(() => {
              this.logMessage(`${this.name}: target object found! writing extension html into target ${this.uniqId}`, targetElement)

              if (!this.targetElementUpdated) {
                this.targetElementUpdated = true
                targetElement.innerHTML = this.extensionData.html
              }
            }, 10)
          }

          this.mutationObserver?.observe(document.body, { subtree: true, childList: true })
        }
      })

      this.logMessage(`${this.name}: setting up DOM observer`, { mutationObserver: this.mutationObserver })

      this.mutationObserver.observe(document.body, { subtree: true, childList: true })
    } catch (e) {
      this.logError(`${this.name}: Something failed while setting up the mutationObserver`, { error: e })
    }
  }

  /**
   * setups a mutationObserver to watch for URL changes and restart the mutationObserver on the HTML
   * and starts DOM observation
   * @private
   */
  private startUrlObserver (): void {
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
        this.mutationObserver?.disconnect()
        this.mutationObserver = undefined

        this.urlMutationObserver?.disconnect()
        this.urlMutationObserver = undefined

        this.targetElement = undefined
        this.targetElementUpdated = false
        void this.run()
      }
    })

    this.logMessage(`${this.name}: setting up URL observer`, { mutationObserver: this.urlMutationObserver })

    this.urlMutationObserver.observe(document.body, { subtree: true, childList: true })
  }
}
