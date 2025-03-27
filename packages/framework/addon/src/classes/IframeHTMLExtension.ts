import {
  type EventData,
  Extension,
  type ExtensionData,
  type ExtensionDependency,
  ExtensionStatus,
  type PeekExtensionsAPI
} from '../Extension.ts'

export interface IframeHTMLExtensionData extends ExtensionData {
  html: string
  targetSelector?: string
  targetElement?: Element,
  iframeSelector?: string,
  iframeTargetSelectorToObserve?: string // TODO might not need this
}

const IFRAME_EXTENSION_DEPENDENCY_TIMEOUT = 2000
const IFRAME_EXTENSION_DEPENDENCY_RETRY_COUNT = 30

/**
 * extension to support external HTML content inside Stetson iframe
 * NOTE: manually call load() whenever you KNOW the DOM is ready, otherwise this extension won't find a valid targetElement
 */
export default class IframeHTMLExtension extends Extension {
  override name: string = 'IframeHTMLExtension'
  declare extensionData: IframeHTMLExtensionData
  iframe: HTMLIFrameElement | null = null
  targetElement?: Element
  currentTimeout?: number | undefined
  mutationObserver?: MutationObserver | undefined
  urlMutationObserver?: MutationObserver | undefined
  targetObjectUpdated: boolean = false

  constructor (
    sendEventToApp: (eventData: EventData) => void,
    listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void,
    loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>,
    extensionsAPI: PeekExtensionsAPI,
    extensionData: IframeHTMLExtensionData
  ) {
    super(sendEventToApp, listenToAppEvent, loadImports, extensionsAPI, extensionData)
    this.extensionData = extensionData
  }

  async load (autoRun: boolean = false): Promise<void> {
    // checks for any web component element present on the HTML
    try {
      if (this.extensionData.dependencies) {
        await this.importDependencies(this.extensionData.dependencies)
      }

      try {
        await this.importWebComponents(this.extensionData.html)
      } catch (e) {
        this.logError('Error importing web components')
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

  async unload (): Promise<void> {
    this.status = ExtensionStatus.INIT

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout)
    }

    this.urlMutationObserver?.disconnect()
    this.urlMutationObserver = undefined
    this.mutationObserver?.disconnect()
    this.mutationObserver = undefined

    return new Promise((resolve) => {
      resolve()
    })
  }

  /**
   * starts observing DOM until the URL changes, SRC of the iframe is updated, and the target DOM element is present to
   * replace its innerHTML with the extensionData.html
   */
  override async run (): Promise<void> {
    this.startUrlObserver()
    await this.startMutationObserverOnHTML()

    return new Promise((resolve) => {
      this.status = ExtensionStatus.READY

      this.dispatchEventToApp({
        eventName: `${this.name}Ready`
      })

      resolve(super.run())
    })
  }

  /**
   * setups a mutationObserver for the iframe content to find targetElement and replace its innerHTML
   *
   * NOTE: the observer will disconnect itself as soon as the targetElement is found and adding HTML to
   * the iframe content, otherwise it will trigger again after the iframe's HTML is updated due to how
   * mutationObserver works
   * @private
   */
  private async startMutationObserverOnHTML (): Promise<void> {
    try {
      const iframeFound = await this.waitUntilIframeIsReady()

      if (!iframeFound) {
        return
      }

      this.mutationObserver = new MutationObserver((_mutationList) => {
        if (this.targetObjectUpdated) {
          this.mutationObserver?.disconnect()
          this.mutationObserver = undefined
          return
        }

        const targetObject = this.iframe?.contentWindow?.document?.body?.querySelector(this.extensionData.targetSelector!) ?? false

        // as soon as we find the targetObject, disconnect the observer and write the extension HTML on the DOM
        if (targetObject) {
          this.logMessage(`${this.name}: target object found!`, targetObject)
          this.targetObjectUpdated = true
          this.mutationObserver?.disconnect()
          targetObject.innerHTML = this.extensionData.html

          this.dispatchEventToApp({
            eventName: `${this.name}Updated`,
            targetObject
          })

          this.mutationObserver = undefined
        }
      })

      // we need to observer both the iframe and the main document to correctly detect DOM updates
      this.mutationObserver.observe(this.iframe!.contentDocument!.body, { childList: true, subtree: true })
      this.mutationObserver.observe(document.body, { subtree: true, childList: true })
    } catch (e) {
      this.logError(`IframeHTMLExtension: iframe not found or not ready, check that your iframe is present on the UI and its document.body element is present in url '${window.location.href}.'`)
    }
  }

  /**
   * setups a mutationObserver to watch for URL changes and restart the mutationObserver on the HTML
   * and starts DOM observation
   * @private
   */
  private startUrlObserver (): void {
    let lastURL = window.location.href
    let iframeSrc = this.iframe?.getAttribute('src') ?? ''

    this.urlMutationObserver = new MutationObserver(() => {
      const currentURL = window.location.href
      const currentIframeSrc = this.iframe?.getAttribute('src') ?? ''

      // whenever URL changes or iframe src is updated, we restart the HTML mutationObserver until element is found
      if (currentURL !== lastURL || currentIframeSrc !== iframeSrc) {
        this.logMessage(`${this.name}: URL/iframe.src change detected`, {
          lastURL,
          currentURL,
          iframeSrc,
          currentIframeSrc
        })

        lastURL = currentURL
        iframeSrc = currentIframeSrc
        this.mutationObserver?.disconnect()
        this.mutationObserver = undefined

        this.urlMutationObserver?.disconnect()
        this.urlMutationObserver = undefined

        this.targetObjectUpdated = false
        void this.run()
      }
    })

    this.urlMutationObserver.observe(document.body, { subtree: true, childList: true })
    const iframeBody = this.iframe?.contentWindow?.document ?? false

    if (iframeBody) {
      this.urlMutationObserver.observe(iframeBody, { subtree: true, childList: true })
    }
  }

  /**
   * returns a promise that waits until the target iframe for this extension is found on the DOM
   * and has its internal document.body element ready
   * @private
   */
  private waitUntilIframeIsReady (): Promise<boolean> {
    const timeout = IFRAME_EXTENSION_DEPENDENCY_TIMEOUT
    let retryAttempts = IFRAME_EXTENSION_DEPENDENCY_RETRY_COUNT

    return new Promise((resolve) => {
      let iframeContent: HTMLElement | null = null

      // here we poll the iframe until there is content inside of it
      const pollIframeDocumentUntilLoaded = () => {
        if (retryAttempts <= 0) {
          clearTimeout(this.currentTimeout)
          resolve(false)
        } else {
          this.iframe = document.querySelector(this.extensionData.iframeSelector!) as HTMLIFrameElement
          iframeContent = this.iframe?.contentWindow?.document?.body ?? null
          const iframeContentIsValid = iframeContent?.classList?.contains?.('ember-application') ?? false
          const bodyIsInIframe = this.iframe?.contentWindow?.document?.contains?.(iframeContent) ?? false

          if (!this.iframe || !iframeContent || !iframeContentIsValid || !bodyIsInIframe) {
            retryAttempts--
            this.logMessage(`${this.name}: iframe not found or not ready, retrying...`, { remainingRetryAttempts: retryAttempts })

            if (this.currentTimeout) {
              clearTimeout(this.currentTimeout)
            }

            this.currentTimeout = window.setTimeout(pollIframeDocumentUntilLoaded, timeout)
          } else {
            this.logMessage(`${this.name}: iframe content found`, iframeContent)
            resolve(true)
          }
        }
      }

      pollIframeDocumentUntilLoaded()
    })
  }
}
