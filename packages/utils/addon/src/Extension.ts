import ExtensionLogger from 'peek-extensions-utils-test/ExtensionLogger'
import { defaultExtensionDependencies } from 'peek-extensions-utils-test/base-dependencies/index'
import type { ExtensionCSSCustomProperty } from 'peek-extensions-utils-test/ExtensionStyles'

export interface PeekExtensionsAPI {
  methods: {
    [key: string]: Function
  }
  logger: {
    log: (message: string, data?: unknown) => void
    logError: (message: string, data?: unknown) => void
  }
  styles: {
    customProperties: ExtensionCSSCustomProperty[]
    setCSSCustomProperty: (name: string, value: string) => void
  }
  apolloGql: {
    gqlStringWrapper: unknown,
    query: (callerExtension: Extension, query: string, variables: object) => Promise<unknown>,
    mutation: (callerExtension: Extension, query: string, variables: object) => Promise<unknown>
  },
  constants: {
    [key: string]: unknown
  }
}

export enum ExtensionStatus {
  INIT = 'init',
  LOADING = 'loading',
  READY = 'ready',
  ERROR = 'error'
}

export enum ExtensionDependencyType {
  GENERIC = 'generic',
  DEPENDENCY = 'dependency',
  WEB_COMPONENT = 'web-component'
}

export interface ExtensionDependency {
  type: ExtensionDependencyType
  isMainScript?: boolean
  name?: string
  url?: string
  importPath?: string
  scriptConfig?: {
    type?: string
    async?: boolean
    defer?: boolean
  }
}

export interface ResolvedExtensionDependency {
  isMainScript: boolean
  type: ExtensionDependencyType
  module?: { default: Function }
  script?: HTMLScriptElement
}

export interface ExtensionData {
  /**
   * unique ID for each extension, used by the framework to allow/disallow extension to do certain things
   *  impacts @broadcastToExtensions
   */
  installId?: string
  /**
   * defines the main dependency that is required to run an extension
   */
  mainDependency?: ExtensionDependency

  /**
   * defines a list of dependencies that are required to run an extension
   */
  dependencies?: ExtensionDependency[]

  /**
   * flag to indicate if the extension is tied to a global scoped component like top-bar, to avoid running
   * the extension on every URL change
   */
  isGlobalScope?: boolean

  /**
   * flag to indicate if the extension should observe query params changes
   * if true, the extension will run again when the query params change
   */
  observeQueryParams?: boolean

  /**
   * flag to indicate if the extension should import default UI lib
   * on tailwind
   */
  importUI?: boolean

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface EventData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface AppEventData extends EventData {
  emitter: Extension
}

export interface AppEventData extends EventData {
  emitter: Extension
}

export abstract class Extension {
  dependencies: { [key: string]: ResolvedExtensionDependency } = {}
  extensionData: ExtensionData
  errors: Error[] = []
  status: ExtensionStatus = ExtensionStatus.INIT

  name: string = 'Extension'
  uniqId: string = ''

  // external references
  loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>
  sendEventToApp: (eventData: AppEventData, eventName?: string) => void
  listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void
  extensionsAPI: PeekExtensionsAPI

  protected constructor (
    sendEventToApp: (eventData: AppEventData) => void,
    listenToAppEvent: (extensionListening: Extension, eventName: string, handler: (event: Event) => void) => void,
    loadImports: (imports: ExtensionDependency[]) => Promise<{ [key: string]: unknown }>,
    extensionsAPI: PeekExtensionsAPI,
    extensionData: ExtensionData
  ) {
    this.loadImports = loadImports
    this.sendEventToApp = sendEventToApp
    this.listenToAppEvent = listenToAppEvent
    this.extensionsAPI = extensionsAPI

    // adds default dependencies to extension data if enabled
    if (extensionData.importUI) {
      if (extensionData.dependencies) {
        extensionData.dependencies.unshift(...defaultExtensionDependencies)
      } else {
        extensionData.dependencies = defaultExtensionDependencies
      }
    }

    this.extensionData = extensionData
  }

  public get isLoading (): boolean {
    return this.status === ExtensionStatus.LOADING
  }

  public get hasError (): boolean {
    return this.status === ExtensionStatus.ERROR
  }

  public get isReady (): boolean {
    return this.status === ExtensionStatus.READY
  }

  /**
   * returns an object that will be bound to the extension script as context
   * @private
   */
  protected get peekExtensionsAPI (): unknown {
    return {
      callPeekExtensionsAPI: this.peekExtensionAPIProxyFunction.bind(this),
      dispatchEventToPeek: this.dispatchEventToApp.bind(this),
      subscribeToAppEvent: this.subscribeToAppEvent.bind(this),
      peekStyles: this.extensionsAPI.styles,
      peekLogger: this.extensionsAPI.logger,
      peekConstants: this.extensionsAPI.constants,
      apolloGql: {
        gqlStringWrapper: this.extensionsAPI.apolloGql.gqlStringWrapper,
        use: this.peekExtensionsAPIProxyApollo.bind(this)
      }
    }
  }

  /**
   * this method acts as a proxy between extensions and the PeekAPI so we can provide an unified way to call
   * our local methods. Also let us bind "this" so we know which extension called each method easily
   * @param method
   * @param args
   */
  public peekExtensionAPIProxyFunction (method: string, ...args: unknown[]): unknown {
    return this.extensionsAPI.methods[method]?.(this, ...args)
  }

  /**
   * this method acts as a proxy between extensions and apolloGQL
   * @param method
   * @param gql
   * @param variables
   *
   * @usage:
   *  this.apolloGql.use('query', query, {
   *    ...variables
   *  })
   *
   *  this.apolloGql.use('mutation', mutation, {
   *    ...variables
   *  })
   */
  public peekExtensionsAPIProxyApollo (
    method: string,
    gql: string,
    variables: { [key: string]: unknown; } = {}
  ): Promise<unknown> {
    if (method === 'query') {
      return this.extensionsAPI.apolloGql.query(this, gql, variables)
    } else if (method === 'mutation') {
      return this.extensionsAPI.apolloGql.mutation(this, gql, variables)
    }

    return Promise.reject(new Error(`Extension::peekExtensionsAPIProxyApollo(): method ${method} not found`))
  }

  /**
   * normalizes the dependency list by adding the main dependency as the first element
   */
  protected get dependencyList (): ExtensionDependency[] {
    const dependenciesToImport = []
    const hasMainDependency = !!this.extensionData.mainDependency || false
    const hasDependencies = (this.extensionData?.dependencies?.length ?? 0) > 0 || false

    if (hasMainDependency || hasDependencies) {
      const dependencies = this.extensionData.dependencies ?? []
      const mainDependency = hasMainDependency ? this.extensionData.mainDependency : undefined

      if (mainDependency) {
        dependenciesToImport.push({
          ...mainDependency,
          isMainScript: true
        } as ExtensionDependency)
      }

      dependenciesToImport.push(...dependencies)
    }

    return dependenciesToImport
  }

  protected get hasDependenciesToImport (): boolean {
    return this.dependencyList.length > 0 || false
  }

  abstract load (autoRun: boolean): Promise<void>

  abstract unload (): Promise<void>

  public run (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.hasError) {
        reject(this.errors)
      }

      this.status = ExtensionStatus.READY

      // gets main script and tries to run it
      const mainScript = Object.values(this.dependencies).find(
        (dependency: ResolvedExtensionDependency) => dependency.isMainScript
      )

      if (mainScript?.module?.default) {
        // we call extension code with this.peekExtensionsAPI as context
        try {
          mainScript.module.default.call(this.peekExtensionsAPI)

          this.dispatchEventToApp({
            eventName: `${this.name}Run`,
            script: mainScript
          })
        } catch (error) {
          this.logError(`${this.name}Error: error(s) detected, cannot run`, { error })
          resolve()
        }
      } else {
        this.dispatchEventToApp({
          eventName: `${this.name}Ready`
        })
      }

      resolve()
    })
  }

  protected logMessage (message: string, data?: unknown): void {
    ExtensionLogger.log(message, data)
  }

  protected logError (errorMessage: string, data?: object) {
    this.status = ExtensionStatus.ERROR

    const errorData = data ? data : {}

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore { cause } is throwing a type error, but Error allow this
    const error = new Error(errorMessage, { cause: errorData })

    ExtensionLogger.logError(error.message, {
      emitter: this,
      ...errorData
    })

    this.errors.push(error)
  }

  /**
   * dispatches an event to the app using this.sendEventToApp that is a reference
   * for an external Evented method (ExtensionEventsService::sendEvent(event))
   * @param eventData
   */
  dispatchEventToApp (eventData: EventData): void {
    this.sendEventToApp({
      emitter: this,
      ...eventData
    })
  }

  /**
   * let extension code subscribe to Ember events, used alongside @broadcastToExtensions decorator
   * @param eventName
   * @param handler
   */
  subscribeToAppEvent (eventName: string, handler: (event: unknown) => void): void {
    this.listenToAppEvent(this, eventName, handler)
  }

  /**
   * imports dependencies from a dependency name list
   * @param dependencies
   */
  async importDependencies (dependencies: ExtensionDependency[]): Promise<void> {
    const loadedImports = await this.loadImports(dependencies)
    this.dependencies = Object.assign(this.dependencies, loadedImports)
  }

  /**
   * imports web components found in given HTML
   * @param html
   */
  async importWebComponents (html: string): Promise<void> {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // directly find web-components by [data-extension-web-component] attribute
    const webComponentElements = Array.from(doc.querySelectorAll('[data-extension-web-component]')) ?? []

    if (webComponentElements.length === 0) {
      ExtensionLogger.log('Extension::importWebComponents(): no web-components found in given HTML')
      return
    }

    ExtensionLogger.log('Extension::importWebComponents(): found web-component', webComponentElements)

    const webComponentImports: ExtensionDependency[] = webComponentElements
      .filter((value, index, self) => self.indexOf(value) === index)
      .map((element) => {
        return {
          isMainScript: false,
          type: ExtensionDependencyType.WEB_COMPONENT,
          name: element.tagName,
          importPath: element.getAttribute('data-extension-web-component')
        } as ExtensionDependency
      })

    ExtensionLogger.log('Extension::importWebComponents(): required web-component imports:', webComponentImports)

    return this.loadImports(webComponentImports).then((importedModulesHash: { [key: string]: unknown }) => {
      this.dependencies = Object.assign(this.dependencies, importedModulesHash)
    }).catch(error => {
      // @ts-expect-error the Error type is not recognizing the second parameter
      throw new Error(`Extension::importWebComponents(): an error occurred while trying to import dependencies for ${this.constructor.name}`, { reason: error })
    })
  }
}
