import { describe, expect, it } from 'vitest'
import { defineFont } from '../src/config.js'
import { parseFontFaceCss } from '../src/css-parser.js'
import { buildCss2Url, createCssApiProvider } from '../src/providers/css-api.js'
import {
    adobe,
    adobeProvider,
    bunnyProvider,
    fontshare,
    fontshareProvider,
    googleProvider,
} from '../src/providers/index.js'
import type { FontProviderContext } from '../src/types.js'

const CSS = `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://example.com/inter-latin-400.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
/* latin-ext */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://example.com/inter-latin-ext-400.woff2) format('woff2');
  unicode-range: U+0100-02AF;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://example.com/inter-latin-700.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`

function createMockContext(css: string): FontProviderContext & { fetched: string[] } {
    const fetched: string[] = []

    return {
        fetched,
        fetchText: async (url) => {
            fetched.push(url)

            return css
        },
        fetchFile: async (url) => {
            fetched.push(url)

            return `/cache/${url.split('/').pop()}`
        },
        parseFontFaces: parseFontFaceCss,
        warn: () => {},
    }
}

describe('buildCss2Url', () => {
    it('builds a css2 url for a single weight', () => {
        const definition = defineFont('Open Sans', googleProvider, { weights: [400] })

        expect(buildCss2Url(definition, 'https://fonts.googleapis.com/css2')).toBe(
            'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&display=swap',
        )
    })

    it('builds a css2 url with italic axis and sorted tuples', () => {
        const definition = defineFont('Inter', googleProvider, {
            weights: [700, 400],
            styles: ['italic', 'normal'],
            display: 'optional',
        })

        expect(buildCss2Url(definition, 'https://fonts.googleapis.com/css2')).toBe(
            'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,400;1,700&display=optional',
        )
    })
})

describe('createCssApiProvider', () => {
    it('fetches css, filters subsets, and downloads files', async () => {
        const provider = createCssApiProvider({ name: 'test', baseUrl: 'https://example.com/css2' })
        const definition = defineFont('Inter', provider, { weights: [400, 700], subsets: ['latin'] })
        const context = createMockContext(CSS)

        const variants = await provider.resolve(definition, context)

        expect(context.fetched[0]).toBe(
            'https://example.com/css2?family=Inter:wght@400;700&display=swap',
        )
        // Only the latin files, not latin-ext.
        expect(context.fetched.slice(1).sort()).toEqual([
            'https://example.com/inter-latin-400.woff2',
            'https://example.com/inter-latin-700.woff2',
        ])
        expect(variants).toEqual([
            {
                weight: 400,
                style: 'normal',
                files: [{
                    source: '/cache/inter-latin-400.woff2',
                    format: 'woff2',
                    unicodeRange: 'U+0000-00FF',
                    subset: 'latin',
                }],
            },
            {
                weight: 700,
                style: 'normal',
                files: [{
                    source: '/cache/inter-latin-700.woff2',
                    format: 'woff2',
                    unicodeRange: 'U+0000-00FF',
                    subset: 'latin',
                }],
            },
        ])
    })

    it('filters families for kit-based apis', async () => {
        const kitCss = CSS + `
@font-face {
  font-family: 'Other Family';
  font-style: normal;
  font-weight: 400;
  src: url(https://example.com/other-400.woff2) format('woff2');
}`
        const provider = createCssApiProvider({
            name: 'kit',
            baseUrl: 'https://example.com/kit.css',
            buildUrl: (_definition, baseUrl) => baseUrl,
        })
        const definition = defineFont('Inter', provider, { weights: [400], subsets: ['latin'] })
        const context = createMockContext(kitCss)

        const variants = await provider.resolve(definition, context)

        expect(variants).toHaveLength(1)
        expect(variants[0]!.files[0]!.source).toBe('/cache/inter-latin-400.woff2')
    })

    it('throws a helpful error listing available families', async () => {
        const provider = createCssApiProvider({ name: 'kit', baseUrl: 'https://example.com/kit.css' })
        const definition = defineFont('Missing', provider)
        const context = createMockContext(CSS)

        await expect(provider.resolve(definition, context)).rejects.toThrowError(
            /no @font-face rules for family "Missing".*Available families: \[Inter\]/s,
        )
    })

    it('throws a helpful error listing available subsets', async () => {
        const provider = createCssApiProvider({ name: 'test', baseUrl: 'https://example.com/css2' })
        const definition = defineFont('Inter', provider, { subsets: ['cyrillic'] })
        const context = createMockContext(CSS)

        await expect(provider.resolve(definition, context)).rejects.toThrowError(
            /Available subsets: \[latin, latin-ext\]/,
        )
    })

    it('can disable subset filtering for apis with non-subset labels', async () => {
        const fontshareCss = `/* Satoshi */
@font-face {
  font-family: 'Satoshi';
  font-style: normal;
  font-weight: 400;
  src: url(//cdn.fontshare.com/wf/satoshi-400.woff2) format('woff2');
}`
        const provider = createCssApiProvider({
            name: 'fontshare',
            baseUrl: 'https://api.fontshare.com/v2/css',
            buildUrl: (definition, baseUrl) =>
                `${baseUrl}?f[]=${definition.family.toLowerCase()}@${definition.weights.join(',')}&display=${definition.display}`,
            filterSubsets: false,
        })
        const definition = defineFont('Satoshi', provider, { weights: [400] })
        const context = createMockContext(fontshareCss)

        const variants = await provider.resolve(definition, context)

        expect(variants).toHaveLength(1)
        // Protocol-relative URLs are normalized to https.
        expect(context.fetched).toContain('https://cdn.fontshare.com/wf/satoshi-400.woff2')
    })

    it('supports transformFaces for custom filtering', async () => {
        const provider = createCssApiProvider({
            name: 'kit',
            baseUrl: 'https://example.com/kit.css',
            buildUrl: (_definition, baseUrl) => baseUrl,
            transformFaces: (faces) =>
                faces.filter((face) => face.src.every((src) => src.url.includes('latin-700'))),
        })
        const definition = defineFont('Inter', provider, { weights: [400, 700], subsets: ['latin'] })
        const context = createMockContext(CSS)

        const variants = await provider.resolve(definition, context)

        expect(variants).toHaveLength(1)
        expect(variants[0]!.weight).toBe(700)
    })
})

describe('built-in providers', () => {
    it('exposes google and bunny providers', () => {
        expect(googleProvider.name).toBe('google')
        expect(bunnyProvider.name).toBe('bunny')
    })

    it('builds fontshare urls from the family and weights', async () => {
        const definition = fontshare('Clash Display', { weights: [400, 700] })
        const context = createMockContext('')

        await expect(fontshareProvider.resolve(definition, context)).rejects.toThrow()

        expect(context.fetched[0]).toBe(
            'https://api.fontshare.com/v2/css?f[]=clash-display@400,700&display=swap',
        )
    })

    it('resolves fontshare css with family-name labels and protocol-relative urls', async () => {
        const fontshareCss = `/* Satoshi */
@font-face {
  font-family: 'Satoshi';
  src: url('//cdn.fontshare.com/wf/satoshi-400.woff2') format('woff2'),
       url('//cdn.fontshare.com/wf/satoshi-400.woff') format('woff');
  font-weight: 400;
  font-display: swap;
  font-style: normal;
}
/* Satoshi */
@font-face {
  font-family: 'Satoshi';
  src: url('//cdn.fontshare.com/wf/satoshi-700.woff2') format('woff2'),
       url('//cdn.fontshare.com/wf/satoshi-700.woff') format('woff');
  font-weight: 700;
  font-display: swap;
  font-style: normal;
}`
        const definition = fontshare('Satoshi', { weights: [400, 700] })
        const context = createMockContext(fontshareCss)

        const variants = await fontshareProvider.resolve(definition, context)

        expect(variants).toHaveLength(2)
        // Only woff2 is downloaded (formats option), normalized to https.
        expect(context.fetched.slice(1).sort()).toEqual([
            'https://cdn.fontshare.com/wf/satoshi-400.woff2',
            'https://cdn.fontshare.com/wf/satoshi-700.woff2',
        ])
        // The family-name label is stripped so it stays out of file names.
        expect(variants[0]!.files[0]!.subset).toBeUndefined()
    })

    it('fetches the adobe kit url directly without special headers', async () => {
        const provider = adobeProvider('https://use.typekit.net/abcdefg.css')
        const definition = adobe('proxima-nova', 'https://use.typekit.net/abcdefg.css', { weights: [400] })
        const context = createMockContext('')

        await expect(provider.resolve(definition, context)).rejects.toThrow()

        expect(context.fetched[0]).toBe('https://use.typekit.net/abcdefg.css')
    })

    it('keeps only the requested family from an adobe kit', async () => {
        const kitCss = `@font-face {
  font-family: 'proxima-nova';
  font-style: normal;
  font-weight: 400;
  src: url(https://use.typekit.net/af/proxima-400.woff2) format('woff2');
}
@font-face {
  font-family: 'proxima-nova';
  font-style: normal;
  font-weight: 700;
  src: url(https://use.typekit.net/af/proxima-700.woff2) format('woff2');
}
@font-face {
  font-family: 'other-kit-family';
  font-style: normal;
  font-weight: 400;
  src: url(https://use.typekit.net/af/other-400.woff2) format('woff2');
}`
        const definition = adobe('proxima-nova', 'https://use.typekit.net/abcdefg.css', { weights: [400] })
        const context = createMockContext(kitCss)

        const variants = await adobeProvider('https://use.typekit.net/abcdefg.css').resolve(definition, context)

        expect(variants).toHaveLength(1)
        expect(variants[0]!.weight).toBe(400)
        expect(context.fetched).not.toContain('https://use.typekit.net/af/other-400.woff2')
    })
})
