import { describe, expect, it } from 'vitest'
import { defineFont } from '../src/config.js'
import { generateFontCss } from '../src/css.js'
import { assignFileNames } from '../src/naming.js'
import type { FontProvider, ResolvedFontFamily } from '../src/types.js'

const dummyProvider: FontProvider = { name: 'dummy', resolve: async () => [] }

function makeFamily(): ResolvedFontFamily {
    return {
        definition: defineFont('Inter', dummyProvider, {
            weights: [400, 700],
            fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        }),
        variants: [
            {
                weight: 400,
                style: 'normal',
                files: [
                    { source: '/cache/a', format: 'woff2', unicodeRange: 'U+0000-00FF', subset: 'latin' },
                    { source: '/cache/b', format: 'woff2', unicodeRange: 'U+0100-02AF', subset: 'latin-ext' },
                ],
            },
            {
                weight: 700,
                style: 'normal',
                files: [
                    { source: '/cache/c', format: 'woff2' },
                    { source: '/cache/d', format: 'woff' },
                ],
            },
        ],
    }
}

describe('assignFileNames', () => {
    it('builds readable names including subset', () => {
        const names = assignFileNames([makeFamily()])

        expect(names.get('/cache/a')).toBe('inter-400-normal-latin.woff2')
        expect(names.get('/cache/b')).toBe('inter-400-normal-latin-ext.woff2')
        expect(names.get('/cache/c')).toBe('inter-700-normal.woff2')
        expect(names.get('/cache/d')).toBe('inter-700-normal.woff')
    })

    it('deduplicates identical sources and disambiguates collisions', () => {
        const family = makeFamily()
        family.variants.push({
            weight: 700,
            style: 'normal',
            files: [
                { source: '/cache/c', format: 'woff2' }, // duplicate source
                { source: '/cache/e', format: 'woff2' }, // same name, different source
            ],
        })

        const names = assignFileNames([family])

        expect(names.get('/cache/c')).toBe('inter-700-normal.woff2')
        expect(names.get('/cache/e')).toMatch(/^inter-700-normal-[0-9a-f]{8}\.woff2$/)
    })

    it('names files shared by multiple weights as variable', () => {
        const family = makeFamily()
        // Variable font: the same file serves both 400 and 700.
        family.variants = [
            { weight: 400, style: 'normal', files: [{ source: '/cache/v', format: 'woff2', subset: 'latin' }] },
            { weight: 700, style: 'normal', files: [{ source: '/cache/v', format: 'woff2', subset: 'latin' }] },
        ]

        const names = assignFileNames([family])

        expect(names.get('/cache/v')).toBe('inter-variable-normal-latin.woff2')
    })

    it('names files from the variant family when a kit spans several families', () => {
        const family: ResolvedFontFamily = {
            definition: defineFont('Font Awesome', dummyProvider, { alias: 'font-awesome' }),
            variants: [
                {
                    family: 'Font Awesome 6 Free',
                    weight: 400,
                    style: 'normal',
                    files: [{ source: '/cache/regular', format: 'woff2' }],
                },
                {
                    family: 'Font Awesome 6 Brands',
                    weight: 400,
                    style: 'normal',
                    files: [{ source: '/cache/brands', format: 'woff2' }],
                },
            ],
        }

        const names = assignFileNames([family])

        expect(names.get('/cache/regular')).toBe('font-awesome-6-free-400-normal.woff2')
        expect(names.get('/cache/brands')).toBe('font-awesome-6-brands-400-normal.woff2')
    })
})

describe('generateFontCss', () => {
    it('generates font faces, variables, and utility classes', () => {
        const family = makeFamily()
        const urlMap = new Map([
            ['/cache/a', './inter-400-normal-latin.woff2'],
            ['/cache/b', './inter-400-normal-latin-ext.woff2'],
            ['/cache/c', './inter-700-normal.woff2'],
            ['/cache/d', './inter-700-normal.woff'],
        ])

        const css = generateFontCss([family], urlMap)

        expect(css).toContain('font-family: "Inter";')
        expect(css).toContain('font-weight: 400;')
        expect(css).toContain('font-display: swap;')
        expect(css).toContain(
            'src: url("./inter-400-normal-latin.woff2") format("woff2");\n  unicode-range: U+0000-00FF;',
        )
        // Multiple formats are combined in one src list.
        expect(css).toContain(
            'src: url("./inter-700-normal.woff2") format("woff2"),\n' +
            '    url("./inter-700-normal.woff") format("woff");',
        )
        expect(css).toContain(
            '--font-inter: "Inter", ui-sans-serif, system-ui, sans-serif;',
        )
        expect(css).toContain('.font-inter {\n  font-family: var(--font-inter);\n}')
    })

    it('combines formats sharing a unicode-range into one font face', () => {
        const family = makeFamily()

        family.variants = [{
            weight: 400,
            style: 'normal',
            files: [
                { source: '/cache/a', format: 'woff2', unicodeRange: 'U+0000-00FF', subset: 'latin' },
                { source: '/cache/b', format: 'woff', unicodeRange: 'U+0000-00FF', subset: 'latin' },
            ],
        }]

        const urlMap = new Map([
            ['/cache/a', './x.woff2'],
            ['/cache/b', './x.woff'],
        ])

        const css = generateFontCss([family], urlMap)

        expect(css.match(/@font-face/g)).toHaveLength(1)
        expect(css).toContain(
            'src: url("./x.woff2") format("woff2"),\n' +
            '    url("./x.woff") format("woff");\n' +
            '  unicode-range: U+0000-00FF;',
        )
    })

    it('rewrites extra css font urls and drops formats that were not downloaded', () => {
        const family: ResolvedFontFamily = {
            definition: defineFont('Font Awesome', dummyProvider, { alias: 'font-awesome' }),
            variants: [{
                family: 'Font Awesome 6 Free',
                weight: 900,
                style: 'normal',
                files: [{
                    source: '/cache/solid',
                    format: 'woff2',
                    url: 'https://ka-f.example/webfonts/solid.woff2?token=abc',
                }],
            }],
            extraCss: [
                '@font-face{font-family:"Font Awesome 6 Free";',
                'src:url(https://ka-f.example/webfonts/solid.woff2?token=abc) format("woff2"),',
                'url(https://ka-f.example/webfonts/solid.ttf?token=abc) format("truetype")}',
                '.fa-user{--fa:"\\f007"}',
            ].join(''),
        }

        const css = generateFontCss([family], new Map([['/cache/solid', './solid.woff2']]))

        expect(css).toContain('url(./solid.woff2) format("woff2")')
        expect(css).not.toContain('solid.ttf')
        expect(css).toContain('.fa-user')
        expect(css).toContain('--font-font-awesome')
    })

    it('uses the original family name from a variant when generating faces', () => {
        const family: ResolvedFontFamily = {
            definition: defineFont('Font Awesome', dummyProvider, { alias: 'font-awesome' }),
            variants: [{
                family: 'Font Awesome 6 Brands',
                weight: 400,
                style: 'normal',
                files: [{ source: '/cache/brands', format: 'woff2' }],
            }],
        }

        const css = generateFontCss([family], new Map([['/cache/brands', './brands.woff2']]))

        expect(css).toContain('font-family: "Font Awesome 6 Brands";')
        expect(css).not.toContain('font-family: "Font Awesome";')
    })
})
