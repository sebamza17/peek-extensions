/**
 * simple logger class for extensions
 * will only be enabled on test/dev envs
 */
export default class ExtensionLogger {
  static enabled: boolean = false
  static logs: unknown[] = []

  static log (message: string, ...info: unknown[]): void {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!window.extensionLogger) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.extensionLogger = this
    }

    const time = new Date()

    try {
      this.logs.push({
        type: 'message',
        time,
        message,
        info
      })

      if (!this.enabled) {
        return
      }

      console.log(`🧩 [ExtensionLogger]: ${message}`, ...info, time)
    } catch (error) {
      console.error('🧩 [ExtensionLoggerError - 🚫]', error, time)
    }
  }

  static logError (message: string, ...info: unknown[]): void {
    const time = new Date()

    try {
      this.logs.push({
        type: 'error',
        time,
        message,
        info
      })

      console.error(`🧩 [ExtensionLogger - 🚫]: ${message}`, ...info, time)
    } catch (error) {
      console.error('🧩 [ExtensionLoggerError - 🚫]', error, time)
    }
  }
}
