import type { FontDefinition, FontOptions, FontProvider } from './types.js'

export function familyToSlug(family: string): string {
    return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/**
 * Create a font definition for any provider. Use this together with
 * `createCssApiProvider` (or a hand-written provider) to support font
 * sources beyond the built-in Google and Bunny providers.
 */
export function defineFont(
    family: string,
    provider: FontProvider,
    options: FontOptions = {},
): FontDefinition {
    const alias = options.alias ?? familyToSlug(family)

    return {
        family,
        provider,
        alias,
        variable: options.variable ?? `--font-${alias}`,
        weights: options.weights ?? [400],
        styles: options.styles ?? ['normal'],
        subsets: options.subsets ?? ['latin'],
        display: options.display ?? 'swap',
        preload: options.preload ?? true,
        fallbacks: options.fallbacks ?? [],
    }
}

export function validateFonts(fonts: FontDefinition[]): FontDefinition[] {
    const aliases = new Set<string>()
    const variables = new Set<string>()

    for (const font of fonts) {
        if (typeof font.family !== 'string' || font.family.trim() === '') {
            throw new Error('vite-plugin-fonts: Font family name must be a non-empty string.')
        }

        if (typeof font.alias !== 'string' || font.alias.trim() === '') {
            throw new Error(
                `vite-plugin-fonts: Font "${font.family}" has an invalid or empty alias.`,
            )
        }

        if (! font.variable.startsWith('--')) {
            throw new Error(
                `vite-plugin-fonts: Font "${font.family}" variable "${font.variable}" must start with "--".`,
            )
        }

        if (typeof font.provider?.resolve !== 'function') {
            throw new Error(
                `vite-plugin-fonts: Font "${font.family}" has an invalid provider. ` +
                `Use google(), bunny(), fontawesome(), defineFont() with a custom provider, or createCssApiProvider().`,
            )
        }

        if (aliases.has(font.alias)) {
            throw new Error(
                `vite-plugin-fonts: Duplicate font alias "${font.alias}". ` +
                `Each alias must be unique. Use the "alias" option to disambiguate.`,
            )
        }

        aliases.add(font.alias)

        if (variables.has(font.variable)) {
            throw new Error(
                `vite-plugin-fonts: Duplicate CSS variable "${font.variable}". ` +
                `Use the "variable" option to set a unique variable name.`,
            )
        }

        variables.add(font.variable)
    }

    return fonts
}
