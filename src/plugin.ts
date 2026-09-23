import fs from 'node:fs'
import path from 'node:path'
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite'
import { cacheKey, fetchAndCache, fetchTextAndCache, resolveCacheDir } from './cache.js'
import { validateFonts } from './config.js'
import { generateFontCss } from './css.js'
import { parseFontFaceCss } from './css-parser.js'
import { buildDevUrlMap, createFontMiddleware } from './dev-server.js'
import { assignFileNames } from './naming.js'
import type {
    FontProviderContext,
    FontsPluginOptions,
    ResolvedFontFamily,
} from './types.js'

export const VIRTUAL_CSS_ID = 'virtual:fonts.css'
const RESOLVED_VIRTUAL_CSS_ID = '\0' + VIRTUAL_CSS_ID

function withBase(base: string, filePath: string): string {
    if (base === '') {
        return filePath
    }

    if (base === './') {
        return `./${filePath}`
    }

    return `${base.endsWith('/') ? base : `${base}/`}${filePath}`
}

function createProviderContext(cacheDir: string, warn: (message: string) => void): FontProviderContext {
    return {
        fetchText: (url, init) => fetchTextAndCache(url, cacheDir, init),
        fetchFile: async (url, init) => {
            await fetchAndCache(url, cacheDir, init)

            return path.join(cacheDir, cacheKey(url))
        },
        parseFontFaces: parseFontFaceCss,
        warn,
    }
}

function collectPreloadUrls(
    families: ResolvedFontFamily[],
    urlMap: Map<string, string>,
): string[] {
    const urls: string[] = []
    const seen = new Set<string>()

    for (const family of families) {
        if (family.definition.preload === false) {
            continue
        }

        for (const variant of family.variants) {
            for (const file of variant.files) {
                if (file.format !== 'woff2') {
                    continue
                }

                const url = urlMap.get(file.source)

                if (url && ! seen.has(url)) {
                    seen.add(url)
                    urls.push(url)
                }
            }
        }
    }

    return urls
}

function preloadTags(urls: string[]): HtmlTagDescriptor[] {
    return urls.map((url) => ({
        tag: 'link',
        injectTo: 'head-prepend' as const,
        attrs: {
            rel: 'preload',
            href: url,
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
        },
    }))
}

export default function fonts(options: FontsPluginOptions): Plugin {
    const definitions = validateFonts(options.fonts ?? [])
    const outputDir = (options.outputDir ?? 'fonts').replace(/^\/+|\/+$/g, '')
    const cssFileName = options.cssFileName ?? 'fonts.css'
    const inject = options.inject ?? true
    const dev = options.dev ?? true

    let config: ResolvedConfig
    let baseUrl: string
    let cacheDir: string
    let resolvedFamilies: ResolvedFontFamily[] = []
    let fileNames = new Map<string, string>()
    let buildTags: HtmlTagDescriptor[] = []
    let pendingEmissions: { css: string, cssPath: string } | null = null
    let buildPublicUrlMap: Map<string, string> | null = null
    let buildCssPublicUrl: string | null = null
    let emitted = false
    let devReady: Promise<void> = Promise.resolve()
    let devFailed = false

    async function resolveFamilies(warn: (message: string) => void): Promise<void> {
        const context = createProviderContext(cacheDir, warn)
        const families: ResolvedFontFamily[] = []

        for (const definition of definitions) {
            families.push({
                definition,
                variants: await definition.provider.resolve(definition, context),
            })
        }

        resolvedFamilies = families
        fileNames = assignFileNames(families)
    }

    return {
        name: 'vite-plugin-fonts',

        resolveId(id) {
            if (id === VIRTUAL_CSS_ID) {
                return RESOLVED_VIRTUAL_CSS_ID
            }
        },

        async load(id) {
            if (id !== RESOLVED_VIRTUAL_CSS_ID) {
                return
            }

            if (definitions.length === 0) {
                return ''
            }

            if (config.command === 'build') {
                if (config.build.ssr) {
                    return ''
                }

                // In build, return the generated CSS with public URLs to the
                // emitted font files. This makes the virtual module importable
                // from user CSS/JS and lets Vite emit it as a stylesheet asset.
                return buildPublicUrlMap
                    ? generateFontCss(resolvedFamilies, buildPublicUrlMap)
                    : ''
            }

            if (! dev) {
                return ''
            }

            await devReady

            if (devFailed || resolvedFamilies.length === 0) {
                return ''
            }

            return generateFontCss(resolvedFamilies, buildDevUrlMap(resolvedFamilies, fileNames))
        },

        configResolved(resolved) {
            config = resolved
            baseUrl = options.baseUrl ?? config.base
            cacheDir = resolveCacheDir(resolved.root, options.cacheDir)
        },

        async buildStart() {
            if (config.command !== 'build' || config.build.ssr || definitions.length === 0) {
                return
            }

            await resolveFamilies((message) => this.warn(message))

            // All emitted paths are deterministic, so the stylesheet and the
            // injected tags can be computed up front.
            const cssUrlMap = new Map<string, string>()
            const publicUrlMap = new Map<string, string>()

            for (const [source, name] of fileNames) {
                cssUrlMap.set(source, `./${name}`)
                publicUrlMap.set(source, withBase(baseUrl, `${outputDir}/${name}`))
            }

            const css = generateFontCss(resolvedFamilies, cssUrlMap)
            const cssPath = `${outputDir}/${cssFileName}`

            buildPublicUrlMap = publicUrlMap
            buildCssPublicUrl = withBase(baseUrl, cssPath)

            buildTags = [
                ...preloadTags(collectPreloadUrls(resolvedFamilies, publicUrlMap)),
                {
                    tag: 'link',
                    injectTo: 'head',
                    attrs: { rel: 'stylesheet', href: buildCssPublicUrl },
                },
            ]

            pendingEmissions = { css, cssPath }
        },

        generateBundle() {
            if (config.command !== 'build' || config.build.ssr || ! pendingEmissions) {
                return
            }

            const emittedSources = new Set<string>()

            for (const family of resolvedFamilies) {
                for (const variant of family.variants) {
                    for (const file of variant.files) {
                        if (emittedSources.has(file.source)) {
                            continue
                        }

                        emittedSources.add(file.source)

                        const name = `${outputDir}/${fileNames.get(file.source)}`

                        this.emitFile({
                            type: 'asset',
                            name,
                            fileName: name,
                            source: fs.readFileSync(file.source),
                        })
                    }
                }
            }

            this.emitFile({
                type: 'asset',
                name: pendingEmissions.cssPath,
                fileName: pendingEmissions.cssPath,
                source: pendingEmissions.css,
            })

            emitted = true
        },

        transformIndexHtml: {
            order: 'post',
            async handler() {
                if (! inject || definitions.length === 0) {
                    return []
                }

                if (config.command === 'build') {
                    return emitted ? buildTags : []
                }

                if (! dev) {
                    return []
                }

                await devReady

                if (devFailed || resolvedFamilies.length === 0) {
                    return []
                }

                const urlMap = buildDevUrlMap(resolvedFamilies, fileNames)

                return [
                    ...preloadTags(collectPreloadUrls(resolvedFamilies, urlMap)),
                    {
                        tag: 'style',
                        injectTo: 'head',
                        children: generateFontCss(resolvedFamilies, urlMap),
                    },
                ]
            },
        },

        configureServer(server) {
            if (! dev || definitions.length === 0) {
                return
            }

            const fontMiddleware = createFontMiddleware()

            server.middlewares.use(fontMiddleware.middleware)

            const ready = (async () => {
                try {
                    await resolveFamilies((message) => server.config.logger.warn(`[vite-plugin-fonts] ${message}`))
                    fontMiddleware.update(resolvedFamilies, fileNames)
                } catch (error) {
                    devFailed = true
                    server.config.logger.error(`[vite-plugin-fonts] ${(error as Error).message}`)
                }
            })()

            fontMiddleware.setReady(ready)
            devReady = ready
        },
    }
}
