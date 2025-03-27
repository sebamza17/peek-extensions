export interface ExtensionCSSCustomProperty {
  name: string
  value: string
}

const availableCSSCustomProperties: ExtensionCSSCustomProperty[] = [
  {
    name: '--ext-color-primary',
    value: '#FF0000',
  }
]

export default class ExtensionStyles {
  static get availableCSSCustomProperties (): ExtensionCSSCustomProperty[] {
    return availableCSSCustomProperties
  }

  /**
   * writes all available CSS custom properties to the root element
   */
  static writeCSSCustomProperties (): void {
    const root = document.documentElement

    availableCSSCustomProperties.forEach((property) => {
      root.style.setProperty(property.name, property.value)
    })
  }

  /**
   * sets a CSS custom property only if it exists in availableCSSCustomProperties
   * @param name
   * @param value
   */
  static setCSSCustomProperty (name: string, value: string): void {
    const root = document.documentElement

    // check if name is inside availableCSSCustomProperties
    const property = availableCSSCustomProperties.find(
      property => property.name === name
    )

    if (!property) {
      throw new Error(`Property ${name} is not available`)
      }

    root.style.setProperty(name, value)
  }
}
