import { defineFont } from '../config.js'
import type { FontDefinition, FontOptions } from '../types.js'
import { createCssApiProvider } from './css-api.js'

export const googleProvider = createCssApiProvider({
    name: 'google',
    baseUrl: 'https://fonts.googleapis.com/css2',
})

export const bunnyProvider = createCssApiProvider({
    name: 'bunny',
    baseUrl: 'https://fonts.bunny.net/css2',
})

export const fontshareProvider = createCssApiProvider({
    name: 'fontshare',
    baseUrl: 'https://api.fontshare.com/v2/css',
    buildUrl: (definition, baseUrl) =>
        `${baseUrl}?f[]=${definition.family.toLowerCase().replace(/ /g, '-')}@${definition.weights.join(',')}&display=${definition.display}`,
    // Fontshare labels its rules with the family name instead of a subset.
    filterSubsets: false,
    formats: ['woff2'],
})

/**
 * Create a provider for an Adobe Fonts kit (https://fonts.adobe.com).
 *
 * The kit URL serves one CSS file containing every family in the kit; the
 * plugin automatically keeps only the requested family, weights, and styles.
 */
export function adobeProvider(kitUrl: string) {
    return createCssApiProvider({
        name: 'adobe',
        baseUrl: kitUrl,
        buildUrl: (_definition, baseUrl) => baseUrl,
        headers: {},
    })
}

/**
 * Download a family from Google Fonts (https://fonts.google.com).
 */
export function google(family: string, options?: FontOptions): FontDefinition {
    return defineFont(family, googleProvider, options)
}

/**
 * Download a family from Bunny Fonts (https://fonts.bunny.net), a GDPR-friendly
 * drop-in replacement for Google Fonts.
 */
export function bunny(family: string, options?: FontOptions): FontDefinition {
    return defineFont(family, bunnyProvider, options)
}

/**
 * Download a family from Fontshare (https://www.fontshare.com).
 */
export function fontshare(family: string, options?: FontOptions): FontDefinition {
    return defineFont(family, fontshareProvider, options)
}

/**
 * Download a family from an Adobe Fonts kit (https://fonts.adobe.com).
 *
 * Pass your kit URL, e.g. `adobe('proxima-nova', 'https://use.typekit.net/abcdefg.css')`.
 */
export function adobe(family: string, kitUrl: string, options?: FontOptions): FontDefinition {
    return defineFont(family, adobeProvider(kitUrl), options)
}
