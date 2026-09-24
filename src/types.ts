export type FontFormat = 'woff2' | 'woff' | 'ttf' | 'otf' | 'eot'

export type FontStyle = 'normal' | 'italic'

export type FontWeight = number | string

export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'

export type FontOptions = {
    /** @default [400] */
    weights?: FontWeight[]

    /** @default ['normal'] */
    styles?: FontStyle[]

    /** @default ['latin'] */
    subsets?: string[]

    /** @default 'swap' */
    display?: FontDisplay

    /**
     * Inject `<link rel="preload">` tags for the downloaded WOFF2 files.
     *
     * @default true
     */
    preload?: boolean

    /**
     * Fallback font families appended after the downloaded family in the
     * generated CSS variable, e.g. `['ui-sans-serif', 'system-ui', 'sans-serif']`.
     *
     * @default []
     */
    fallbacks?: string[]

    /**
     * Used to reference the font in the generated utility class
     * (`.font-{alias}`). Defaults to a slug of the family name.
     */
    alias?: string

    /**
     * CSS variable holding the font stack. Defaults to `--font-{alias}`.
     */
    variable?: string
}

export type FontDefinition = Required<FontOptions> & {
    family: string
    provider: FontProvider
}

export type ResolvedFontFile = {
    /** Absolute path of the downloaded file on disk. */
    source: string
    format: FontFormat
    unicodeRange?: string
    /** Subset label (e.g. "latin"), used to build readable file names. */
    subset?: string
    /** Original remote URL, used to rewrite extra CSS onto local files. */
    url?: string
}

export type ResolvedFontVariant = {
    /**
     * Original family name from the source CSS. Used when one definition
     * downloads several families (e.g. a Font Awesome kit).
     */
    family?: string
    weight: FontWeight
    style: FontStyle
    files: ResolvedFontFile[]
}

export type ResolvedFontFamily = {
    definition: FontDefinition
    variants: ResolvedFontVariant[]
    /**
     * Additional CSS to emit as-is after rewriting downloaded font URLs
     * (e.g. Font Awesome icon classes).
     */
    extraCss?: string
}

export type ParsedFontFace = {
    family: string
    style: FontStyle
    weight: FontWeight
    src: ParsedFontSrc[]
    unicodeRange?: string
    display?: string
    /**
     * The subset label from the CSS comment preceding the rule (e.g. "latin"),
     * as emitted by the Google and Bunny CSS APIs.
     */
    subset?: string
}

export type ParsedFontSrc = {
    url: string
    format: FontFormat
}

/**
 * Context handed to providers when resolving a font family. Providers use it
 * to download CSS and font files (with caching) and to parse `@font-face` CSS.
 */
export type FontProviderContext = {
    /** Fetch a text resource, cached on disk. */
    fetchText: (url: string, init?: RequestInit) => Promise<string>
    /** Fetch a binary file, cached on disk. Resolves to the cached file path. */
    fetchFile: (url: string, init?: RequestInit) => Promise<string>
    /** Parse `@font-face` rules from CSS. */
    parseFontFaces: (css: string) => ParsedFontFace[]
    warn: (message: string) => void
}

/**
 * A font source. Implement this interface to add support for additional
 * sources (Adobe Fonts, Fontshare, self-hosted CDNs, ...).
 *
 * For sources exposing a CSS API that returns `@font-face` rules, use the
 * `createCssApiProvider` helper instead of implementing this by hand.
 *
 * Providers may return either a variant list or `{ variants, extraCss }`
 * when they also need to emit source CSS (icon classes, etc.).
 */
export type FontProviderResult = ResolvedFontVariant[] | {
    variants: ResolvedFontVariant[]
    extraCss?: string
}

export interface FontProvider {
    name: string
    resolve: (definition: FontDefinition, context: FontProviderContext) => Promise<FontProviderResult>
}

export type FontsPluginOptions = {
    /** Font families to download. */
    fonts: FontDefinition[]

    /**
     * Directory (relative to the build output) for the font files and the
     * generated stylesheet.
     *
     * @default 'fonts'
     */
    outputDir?: string

    /**
     * Name of the generated stylesheet, inside `outputDir`.
     *
     * @default 'fonts.css'
     */
    cssFileName?: string

    /**
     * Cache directory for downloaded CSS and font files.
     *
     * @default 'node_modules/.cache/vite-plugin-fonts'
     */
    cacheDir?: string

    /**
     * Inject the stylesheet and preload links into `index.html`.
     *
     * @default true
     */
    inject?: boolean

    /**
     * Serve the fonts from the dev server and inject them into `index.html`
     * during development.
     *
     * @default true
     */
    dev?: boolean

    /**
     * Override the public base URL used for the generated stylesheet and font
     * files. Defaults to Vite's configured `base`.
     */
    baseUrl?: string
}

export const FORMAT_MIME: Record<FontFormat, string> = {
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
}
