import { describe, expect, it } from 'vitest'
import { parseFontFaceCss } from '../src/css-parser.js'

const GOOGLE_CSS = `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v13/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF,U+0131;
}
/* latin-ext */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v13/latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02AF;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v13/latin-italic.woff2) format('woff2');
  unicode-range: U+0000-00FF,U+0131;
}`

const BUNNY_CSS_WITH_FALLBACK = `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff2) format('woff2'), url(https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff) format('woff');
  unicode-range: U+0000-00FF,U+0131;
}`

describe('parseFontFaceCss', () => {
    it('parses subset-labelled google css', () => {
        const faces = parseFontFaceCss(GOOGLE_CSS)

        expect(faces).toHaveLength(3)
        expect(faces[0]).toMatchObject({
            family: 'Inter',
            style: 'normal',
            weight: 400,
            subset: 'latin',
            display: 'swap',
            unicodeRange: 'U+0000-00FF,U+0131',
        })
        expect(faces[0]!.src).toEqual([
            { url: 'https://fonts.gstatic.com/s/inter/v13/latin.woff2', format: 'woff2' },
        ])
        expect(faces[1]!.subset).toBe('latin-ext')
        expect(faces[2]).toMatchObject({ style: 'italic', weight: 700, subset: 'latin' })
    })

    it('parses multiple sources per src descriptor', () => {
        const faces = parseFontFaceCss(BUNNY_CSS_WITH_FALLBACK)

        expect(faces).toHaveLength(1)
        expect(faces[0]!.src).toEqual([
            { url: 'https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff2', format: 'woff2' },
            { url: 'https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff', format: 'woff' },
        ])
    })

    it('normalizes format keywords', () => {
        const css = `@font-face {
          font-family: 'Test';
          src: url(https://example.com/test.ttf) format('truetype'), url(https://example.com/test.otf) format('opentype');
        }`
        const faces = parseFontFaceCss(css)

        expect(faces[0]!.src).toEqual([
            { url: 'https://example.com/test.ttf', format: 'ttf' },
            { url: 'https://example.com/test.otf', format: 'otf' },
        ])
    })

    it('infers format from url when format() is missing', () => {
        const css = `@font-face {
          font-family: 'Test';
          src: url(https://example.com/test.woff2);
        }`
        const faces = parseFontFaceCss(css)

        expect(faces[0]!.src).toEqual([{ url: 'https://example.com/test.woff2', format: 'woff2' }])
    })

    it('handles unlabelled rules and weight ranges', () => {
        const css = `@font-face {
          font-family: 'Test';
          font-style: normal;
          font-weight: 100 900;
          src: url(https://example.com/test.woff2) format('woff2');
        }`
        const faces = parseFontFaceCss(css)

        expect(faces[0]!.weight).toBe('100 900')
        expect(faces[0]!.subset).toBeUndefined()
    })

    it('skips blocks without family or src', () => {
        const css = `@font-face { font-style: normal; }`

        expect(parseFontFaceCss(css)).toEqual([])
    })
})
