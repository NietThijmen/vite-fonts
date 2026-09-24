import { describe, expect, it } from 'vitest'
import { parseFontFaceCss } from '../src/css-parser.js'
import {
    fontawesome,
    fontawesomeProvider,
    normalizeFontAwesomeKitUrl,
    parseFontAwesomeKitConfig,
    resolveFontAwesomeStylesheetUrls,
    rewriteFontAwesomeCssUrls,
} from '../src/providers/fontawesome.js'
import type { FontProviderContext } from '../src/types.js'

const KIT_CSS = `@font-face {
  font-family: "Font Awesome 6 Brands";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(../webfonts/free-fa-brands-400.woff2) format("woff2"), url(../webfonts/free-fa-brands-400.ttf) format("truetype");
}
@font-face {
  font-family: "Font Awesome 6 Free";
  font-style: normal;
  font-weight: 400;
  src: url(../webfonts/free-fa-regular-400.woff2) format("woff2");
}
@font-face {
  font-family: "Font Awesome 6 Free";
  font-style: normal;
  font-weight: 900;
  src: url(../webfonts/free-fa-solid-900.woff2) format("woff2");
}
.fa-solid { font-family: "Font Awesome 6 Free"; font-weight: 900; }
.fa-user { --fa: "\\f007"; }
`

const KIT_JS = `window.FontAwesomeKitConfig = ${JSON.stringify({
    id: 123,
    version: '6.7.2',
    token: 'abc123',
    method: 'css',
    minify: { enabled: true },
    baseUrl: 'https://ka-f.fontawesome.com',
    license: 'free',
    startupFilename: 'free.min.css',
    v4FontFaceShim: { enabled: false },
    v4shim: { enabled: false },
    v5FontFaceShim: { enabled: false },
})};
!function(){"use strict";}();
`

function createMockContext(
    resources: Record<string, string>,
): FontProviderContext & { fetched: string[] } {
    const fetched: string[] = []

    return {
        fetched,
        fetchText: async (url) => {
            fetched.push(url)

            const body = resources[url]

            if (body === undefined) {
                throw new Error(`404 ${url}`)
            }

            return body
        },
        fetchFile: async (url) => {
            fetched.push(url)

            return `/cache/${url.split('/').pop()?.split('?')[0]}`
        },
        parseFontFaces: parseFontFaceCss,
        warn: () => {},
    }
}

describe('fontawesome helpers', () => {
    it('normalizes kit tokens to kit.js urls', () => {
        expect(normalizeFontAwesomeKitUrl('abc123')).toBe('https://kit.fontawesome.com/abc123.js')
        expect(normalizeFontAwesomeKitUrl('https://kit.fontawesome.com/abc123.js')).toBe(
            'https://kit.fontawesome.com/abc123.js',
        )
        expect(normalizeFontAwesomeKitUrl('//kit.fontawesome.com/abc123.js')).toBe(
            'https://kit.fontawesome.com/abc123.js',
        )
    })

    it('parses FontAwesomeKitConfig from a kit script', () => {
        expect(parseFontAwesomeKitConfig(KIT_JS)).toMatchObject({
            token: 'abc123',
            version: '6.7.2',
            method: 'css',
            startupFilename: 'free.min.css',
        })
    })

    it('builds the webfont css url the kit loader would fetch', () => {
        const config = parseFontAwesomeKitConfig(KIT_JS)

        expect(resolveFontAwesomeStylesheetUrls(config)).toEqual([
            'https://ka-f.fontawesome.com/releases/v6.7.2/css/free.min.css?token=abc123',
        ])
    })

    it('rejects svg+js kits', () => {
        const config = parseFontAwesomeKitConfig(KIT_JS)

        config.method = 'js'

        expect(() => resolveFontAwesomeStylesheetUrls(config)).toThrowError(/SVG\+JS/)
    })

    it('rewrites relative webfont urls like the official loader', () => {
        const css = rewriteFontAwesomeCssUrls(
            'src:url(../webfonts/free-fa-solid-900.woff2) format("woff2")',
            parseFontAwesomeKitConfig(KIT_JS),
        )

        expect(css).toContain(
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-solid-900.woff2?token=abc123',
        )
    })
})

describe('fontawesome provider', () => {
    const cssUrl = 'https://ka-f.fontawesome.com/releases/v6.7.2/css/free.min.css?token=abc123'
    const kitUrl = 'https://kit.fontawesome.com/abc123.js'

    function resources(): Record<string, string> {
        return {
            [kitUrl]: KIT_JS,
            [cssUrl]: KIT_CSS,
        }
    }

    it('resolves a js kit to css, downloads every family, and keeps icon css', async () => {
        const definition = fontawesome(kitUrl)
        const context = createMockContext(resources())

        const result = await definition.provider.resolve(definition, context)

        expect(Array.isArray(result)).toBe(false)
        if (Array.isArray(result)) {
            return
        }

        expect(context.fetched[0]).toBe(kitUrl)
        expect(context.fetched[1]).toBe(cssUrl)
        expect(context.fetched.slice(2).sort()).toEqual([
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-brands-400.woff2?token=abc123',
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-regular-400.woff2?token=abc123',
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-solid-900.woff2?token=abc123',
        ])
        expect(result.variants).toHaveLength(3)
        expect(result.variants.map((variant) => variant.family).sort()).toEqual([
            'Font Awesome 6 Brands',
            'Font Awesome 6 Free',
            'Font Awesome 6 Free',
        ])
        expect(result.extraCss).toContain('.fa-user')
        expect(result.extraCss).toContain(
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-solid-900.woff2?token=abc123',
        )
    })

    it('can keep a single family from the kit', async () => {
        const definition = fontawesome('Font Awesome 6 Free', kitUrl, { weights: [900] })
        const context = createMockContext(resources())

        const result = await definition.provider.resolve(definition, context)

        expect(Array.isArray(result)).toBe(false)
        if (Array.isArray(result)) {
            return
        }

        expect(result.variants).toHaveLength(1)
        expect(result.variants[0]).toMatchObject({
            family: 'Font Awesome 6 Free',
            weight: 900,
        })
        expect(context.fetched).not.toContain(
            'https://ka-f.fontawesome.com/releases/v6.7.2/webfonts/free-fa-brands-400.woff2?token=abc123',
        )
    })

    it('accepts a css stylesheet url directly', async () => {
        const cssHref = 'https://use.fontawesome.com/releases/v6.7.2/css/all.css'
        const definition = fontawesome(cssHref)
        const context = createMockContext({ [cssHref]: KIT_CSS })

        const result = await definition.provider.resolve(definition, context)

        expect(Array.isArray(result)).toBe(false)
        if (Array.isArray(result)) {
            return
        }

        expect(context.fetched).toContain(
            'https://use.fontawesome.com/releases/v6.7.2/webfonts/free-fa-solid-900.woff2',
        )
        expect(result.extraCss).toContain('.fa-solid')
    })

    it('can omit icon css', async () => {
        const definition = fontawesome(kitUrl, { icons: false })
        const context = createMockContext(resources())

        const result = await definition.provider.resolve(definition, context)

        expect(Array.isArray(result)).toBe(false)
        if (Array.isArray(result)) {
            return
        }

        expect(result.extraCss).toBeUndefined()
        expect(result.variants.length).toBeGreaterThan(0)
    })

    it('throws for svg+js kits', async () => {
        const jsKit = KIT_JS.replace('"method":"css"', '"method":"js"')
        const definition = fontawesome(kitUrl)
        const context = createMockContext({ [kitUrl]: jsKit })

        await expect(definition.provider.resolve(definition, context)).rejects.toThrowError(/SVG\+JS/)
    })

    it('uses a kit-wide alias when only the url is passed', () => {
        const definition = fontawesome('abc123')

        expect(definition.family).toBe('Font Awesome')
        expect(definition.alias).toBe('font-awesome')
        expect(definition.preload).toBe(false)
        expect(definition.provider.name).toBe('fontawesome')
    })

    it('exposes the provider factory', () => {
        expect(fontawesomeProvider('abc123').name).toBe('fontawesome')
    })
})
