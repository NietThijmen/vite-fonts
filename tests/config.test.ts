import { describe, expect, it } from 'vitest'
import { defineFont, validateFonts } from '../src/config.js'
import { google } from '../src/providers/index.js'
import type { FontProvider } from '../src/types.js'

const dummyProvider: FontProvider = {
    name: 'dummy',
    resolve: async () => [],
}

describe('defineFont', () => {
    it('applies defaults', () => {
        const font = defineFont('Inter', dummyProvider)

        expect(font).toMatchObject({
            family: 'Inter',
            alias: 'inter',
            variable: '--font-inter',
            weights: [400],
            styles: ['normal'],
            subsets: ['latin'],
            display: 'swap',
            preload: true,
            fallbacks: [],
        })
    })

    it('sluggifies family names for alias and variable', () => {
        const font = defineFont('Open Sans!', dummyProvider)

        expect(font.alias).toBe('open-sans')
        expect(font.variable).toBe('--font-open-sans')
    })

    it('respects explicit options', () => {
        const font = defineFont('Inter', dummyProvider, {
            weights: [400, 700],
            styles: ['normal', 'italic'],
            subsets: ['latin', 'latin-ext'],
            display: 'optional',
            preload: false,
            fallbacks: ['system-ui', 'sans-serif'],
            alias: 'body',
            variable: '--font-body',
        })

        expect(font).toMatchObject({
            weights: [400, 700],
            styles: ['normal', 'italic'],
            subsets: ['latin', 'latin-ext'],
            display: 'optional',
            preload: false,
            fallbacks: ['system-ui', 'sans-serif'],
            alias: 'body',
            variable: '--font-body',
        })
    })
})

describe('validateFonts', () => {
    it('rejects duplicate aliases', () => {
        expect(() => validateFonts([
            google('Inter'),
            google('Inter'),
        ])).toThrowError(/Duplicate font alias "inter"/)
    })

    it('rejects duplicate variables', () => {
        expect(() => validateFonts([
            google('Inter', { alias: 'a', variable: '--font-x' }),
            google('Roboto', { alias: 'b', variable: '--font-x' }),
        ])).toThrowError(/Duplicate CSS variable "--font-x"/)
    })

    it('rejects variables without a -- prefix', () => {
        expect(() => validateFonts([
            google('Inter', { variable: 'font-inter' }),
        ])).toThrowError(/must start with "--"/)
    })

    it('rejects empty family names', () => {
        expect(() => validateFonts([
            defineFont('  ', dummyProvider),
        ])).toThrowError(/non-empty string/)
    })

    it('accepts distinct families', () => {
        expect(validateFonts([google('Inter'), google('Roboto')])).toHaveLength(2)
    })
})
