import { defineFont } from '../config.js'
import type {
    FontDefinition,
    FontOptions,
    FontProvider,
    FontProviderContext,
} from '../types.js'
import { downloadFaces, filterFaces, resolveCssAssetUrl } from './css-api.js'

const WOFF2_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const KIT_FAMILY = 'Font Awesome'

export type FontAwesomeOptions = FontOptions & {
    /**
     * Include Font Awesome icon/utility CSS (`.fa-solid`, `.fa-user`, …)
     * with font URLs rewritten to the downloaded files.
     *
     * @default true
     */
    icons?: boolean

    /**
     * Site origin allowed to use this kit (Font Awesome "Limit Domains").
     * Sent as `Origin` and `Referer` so a domain-restricted kit can be
     * downloaded at build time, e.g. `'https://example.com'`.
     */
    origin?: string
}

export type FontAwesomeKitConfig = {
    id?: number | string
    version?: string
    token?: string
    method?: string
    license?: string
    baseUrl?: string
    baseUrlKit?: string
    startupFilename?: string
    minify?: { enabled?: boolean }
    v4shim?: { enabled?: boolean }
    v4FontFaceShim?: { enabled?: boolean }
    v5FontFaceShim?: { enabled?: boolean }
    customIconsCssPath?: string
    subsetPath?: string
}

type FontAwesomeProviderOptions = {
    allFamilies?: boolean
    icons?: boolean
    origin?: string
}

/**
 * Accept a full kit/CSS URL or a bare kit token (`abcdef1234`).
 */
export function normalizeFontAwesomeKitUrl(input: string): string {
    const trimmed = input.trim()

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed
    }

    if (trimmed.startsWith('//')) {
        return `https:${trimmed}`
    }

    if (/^[a-z0-9]+$/i.test(trimmed)) {
        return `https://kit.fontawesome.com/${trimmed}.js`
    }

    return trimmed
}

/**
 * Extract `window.FontAwesomeKitConfig = {...}` from a kit loader script.
 */
export function parseFontAwesomeKitConfig(source: string): FontAwesomeKitConfig {
    const match = /FontAwesomeKitConfig\s*=\s*(\{[\s\S]*?\})\s*;/.exec(source)

    if (! match?.[1]) {
        throw new Error(
            'vite-plugin-fonts: fontawesome could not find FontAwesomeKitConfig in the kit script. ' +
            'Pass a kit JS URL (https://kit.fontawesome.com/xxxxx.js) or a CSS stylesheet URL.',
        )
    }

    try {
        return JSON.parse(match[1]) as FontAwesomeKitConfig
    } catch {
        throw new Error(
            'vite-plugin-fonts: fontawesome could not parse FontAwesomeKitConfig from the kit script.',
        )
    }
}

export function kitStylesheetFilename(config: FontAwesomeKitConfig, addOn?: string): string {
    const minify = config.minify?.enabled !== false
    const suffix = minify ? '.min.css' : '.css'

    if (addOn) {
        return `${config.license ?? 'free'}${addOn}${suffix}`
    }

    if (config.startupFilename) {
        return config.startupFilename
    }

    return `${config.license ?? 'free'}${suffix}`
}

export function fontAwesomeStylesheetUrl(config: FontAwesomeKitConfig, filename: string): string {
    const base = (config.baseUrl ?? 'https://ka-f.fontawesome.com').replace(/\/$/, '')

    if (! config.version) {
        throw new Error(
            'vite-plugin-fonts: fontawesome kit config is missing a version. ' +
            'The kit URL may not be a webfont kit.',
        )
    }

    const url = new URL(`${base}/releases/v${config.version}/css/${filename}`)

    if (config.token) {
        url.searchParams.set('token', config.token)
    }

    return url.href
}

/**
 * Stylesheets the official kit loader would inject for a webfont kit.
 */
export function resolveFontAwesomeStylesheetUrls(config: FontAwesomeKitConfig): string[] {
    if (config.method === 'js') {
        throw new Error(
            'vite-plugin-fonts: fontawesome kit uses SVG+JS (method "js"), which has no webfont files. ' +
            'Switch the kit to Web Fonts (CSS) in the Font Awesome kit settings.',
        )
    }

    const urls: string[] = []

    if (config.subsetPath && config.baseUrl) {
        const url = new URL(`${config.baseUrl.replace(/\/$/, '')}/${config.subsetPath.replace(/^\//, '')}`)

        if (config.token) {
            url.searchParams.set('token', config.token)
        }

        urls.push(url.href)
    } else {
        urls.push(fontAwesomeStylesheetUrl(config, kitStylesheetFilename(config)))
    }

    if (config.v4shim?.enabled) {
        urls.push(fontAwesomeStylesheetUrl(config, kitStylesheetFilename(config, '-v4-shims')))
    }

    if (config.v5FontFaceShim?.enabled) {
        urls.push(fontAwesomeStylesheetUrl(config, kitStylesheetFilename(config, '-v5-font-face')))
    }

    if (config.v4FontFaceShim?.enabled) {
        urls.push(fontAwesomeStylesheetUrl(config, kitStylesheetFilename(config, '-v4-font-face')))
    }

    if (config.customIconsCssPath) {
        const host = config.customIconsCssPath.includes('kit-upload.css')
            ? (config.baseUrlKit ?? 'https://kit.fontawesome.com')
            : (config.baseUrl ?? 'https://ka-f.fontawesome.com')

        urls.push(`${host.replace(/\/$/, '')}/${config.customIconsCssPath.replace(/^\//, '')}`)
    }

    return urls
}

/**
 * Rewrite the relative webfont paths the Font Awesome kit CSS ships with,
 * matching the official kit loader.
 */
export function rewriteFontAwesomeCssUrls(css: string, config: FontAwesomeKitConfig): string {
    const base = (config.baseUrl ?? '').replace(/\/$/, '')
    const version = config.version ?? ''

    let rewritten = css.replace(/url\(\s*(['"]?)\.\.\/\.\.\/\.\./g, `url($1${base}`)

    rewritten = rewritten.replace(
        /url\(\s*(['"]?)\.\.\/webfonts/g,
        `url($1${base}/releases/v${version}/webfonts`,
    )

    if (config.token) {
        rewritten = rewritten.replace(
            /url\(\s*(['"]?)(https?:\/\/[^'")]+)\1\s*\)/g,
            (full, quote: string, url: string) => {
                if (! url.includes('/webfonts/')) {
                    return full
                }

                const resolved = new URL(url)

                if (! resolved.searchParams.has('token')) {
                    resolved.searchParams.set('token', config.token!)
                }

                return `url(${quote}${resolved.href}${quote})`
            },
        )
    }

    return rewritten
}

/**
 * Normalize a kit origin to a URL. A bare host (`example.com`) is treated
 * as `https://example.com/`.
 */
export function normalizeKitOrigin(input: string): URL {
    const trimmed = input.trim()
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

    try {
        return new URL(withProtocol)
    } catch {
        throw new Error(
            `vite-plugin-fonts: fontawesome origin "${input}" is not a valid URL.`,
        )
    }
}

export function kitOriginHeaders(origin?: string): Record<string, string> {
    if (! origin?.trim()) {
        return {}
    }

    const url = normalizeKitOrigin(origin)

    return {
        Origin: url.origin,
        Referer: url.href,
    }
}

export function kitRequestHeaders(token?: string, origin?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'User-Agent': WOFF2_USER_AGENT,
        ...kitOriginHeaders(origin),
    }

    if (token) {
        headers['fa-kit-token'] = token
    }

    return headers
}

function looksLikeCss(source: string): boolean {
    return /@font-face\b/.test(source)
        || (! /FontAwesomeKitConfig/.test(source) && /font-family\s*:/.test(source))
}

function tokenFromKitUrl(url: string): string | undefined {
    return /kit\.fontawesome\.com\/([a-z0-9]+)/i.exec(url)?.[1]
}

function withToken(url: string, token?: string): string {
    if (! token) {
        return url
    }

    try {
        const parsed = new URL(url)

        if (parsed.pathname.includes('webfonts') && ! parsed.searchParams.has('token')) {
            parsed.searchParams.set('token', token)
        }

        return parsed.href
    } catch {
        return url
    }
}

/**
 * Turn every `url(...)` in a stylesheet into an absolute URL, optionally
 * appending the kit token used to authorize webfont downloads.
 */
export function absolutizeCssUrls(css: string, cssUrl: string, token?: string): string {
    return css.replace(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
        (_full, quote: string, rawUrl: string) => {
            const url = withToken(resolveCssAssetUrl(rawUrl, cssUrl), token)

            return `url(${quote}${url}${quote})`
        },
    )
}

async function loadKitCss(
    kitUrl: string,
    context: FontProviderContext,
    origin?: string,
): Promise<{ css: string, cssUrl: string, token?: string, headers: Record<string, string> }> {
    const source = await context.fetchText(kitUrl, { headers: kitRequestHeaders(undefined, origin) })

    if (/FontAwesomeKitConfig/.test(source)) {
        const config = parseFontAwesomeKitConfig(source)
        const headers = kitRequestHeaders(config.token, origin)
        const stylesheetUrls = resolveFontAwesomeStylesheetUrls(config)
        const parts: string[] = []

        for (const [index, url] of stylesheetUrls.entries()) {
            try {
                const sheet = await context.fetchText(url, { headers })

                parts.push(absolutizeCssUrls(rewriteFontAwesomeCssUrls(sheet, config), url, config.token))
            } catch (error) {
                if (index === 0) {
                    throw error
                }

                context.warn(
                    `fontawesome: skipped optional kit stylesheet "${url}": ${(error as Error).message}`,
                )
            }
        }

        return {
            css: parts.join('\n'),
            cssUrl: stylesheetUrls[0] ?? kitUrl,
            token: config.token,
            headers,
        }
    }

    if (looksLikeCss(source)) {
        const token = tokenFromKitUrl(kitUrl)
        const headers = kitRequestHeaders(token, origin)

        return {
            css: absolutizeCssUrls(source, kitUrl, token),
            cssUrl: kitUrl,
            token,
            headers,
        }
    }

    throw new Error(
        `vite-plugin-fonts: fontawesome did not recognize "${kitUrl}" as a kit script or CSS stylesheet. ` +
        'Pass https://kit.fontawesome.com/xxxxx.js or a CSS URL that contains @font-face rules.',
    )
}

export function fontawesomeProvider(
    kitUrl: string,
    providerOptions: FontAwesomeProviderOptions = {},
): FontProvider {
    const resolvedKitUrl = normalizeFontAwesomeKitUrl(kitUrl)

    return {
        name: 'fontawesome',

        async resolve(definition, context) {
            const { css, cssUrl, headers } = await loadKitCss(resolvedKitUrl, context, providerOptions.origin)
            let faces = context.parseFontFaces(css)

            if (faces.length === 0) {
                throw new Error(
                    `vite-plugin-fonts: fontawesome returned no @font-face rules from "${resolvedKitUrl}". ` +
                    'Use a Web Fonts (CSS) kit, not an SVG+JS kit.',
                )
            }

            if (! providerOptions.allFamilies) {
                faces = filterFaces(faces, definition, 'fontawesome', false)
            }

            const variants = await downloadFaces(
                faces,
                definition,
                context,
                headers,
                ['woff2'],
                cssUrl,
            )

            return {
                variants,
                extraCss: providerOptions.icons === false ? undefined : css,
            }
        },
    }
}

export function fontawesome(kitUrl: string, options?: FontAwesomeOptions): FontDefinition
export function fontawesome(family: string, kitUrl: string, options?: FontAwesomeOptions): FontDefinition
export function fontawesome(
    familyOrKitUrl: string,
    kitUrlOrOptions?: string | FontAwesomeOptions,
    options?: FontAwesomeOptions,
): FontDefinition {
    if (typeof kitUrlOrOptions === 'string') {
        const { icons, origin, ...fontOptions } = options ?? {}

        return defineFont(familyOrKitUrl, fontawesomeProvider(kitUrlOrOptions, { icons, origin }), {
            weights: [400, 900],
            ...fontOptions,
        })
    }

    const { icons, origin, ...fontOptions } = kitUrlOrOptions ?? {}

    return defineFont(KIT_FAMILY, fontawesomeProvider(familyOrKitUrl, { allFamilies: true, icons, origin }), {
        alias: 'font-awesome',
        preload: false,
        ...fontOptions,
    })
}
