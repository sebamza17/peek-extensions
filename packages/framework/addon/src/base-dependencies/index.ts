import { ExtensionDependencyType } from '../Extension.ts'

/**
 * these dependencies are being added to every extension by default
 *
 * NOTE: have in mind that each extension will try to load these, we're relying on browser
 * cache to avoid re-loading the same dependency many times.
 */
export const defaultExtensionDependencies = [
  {
    type: 'generic' as ExtensionDependencyType,
    name: 'tailwind',
    url: 'https://cdn.tailwindcss.com',
  }
]
