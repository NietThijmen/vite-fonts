import type {
    FontDefinition,
    FontFormat,
    FontProvider,
    FontProviderContext,
    ParsedFontFace,
    ResolvedFontFile,
    ResolvedFontVariant,
} from '../types.js'

const WOFF2_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const FORMAT_PREFERENCE = ['woff2', 'woff', 'ttf', 'otf', 'eot']

export type CssApiProviderOptions = {
    /** Provider name, used in error messages. */
    name: string

    /**
     * Base URL of the CSS API, e.g. `https://fonts.googleapis.com/css2`.
     */
    baseUrl: string

    /**
     * Build the CSS request URL for a font family. Defaults to the
     * Google Fonts CSS2 API format (`?family=X:ital,wght@...&display=...`),
     * which Bunny Fonts also supports.
     */
    buildUrl?: (definition: FontDefinition, baseUrl: string) => string

    /**
     * Headers sent with the CSS and font file requests. Defaults to a
     * WOFF2-capable browser user agent, which the Google and Bunny CSS
     * APIs require to serve WOFF2.
     */
    headers?: Record<string, string> | ((definition: FontDefinition) => Record<string, string>)

    /**
     * Post-process the parsed `@font-face` rules before filtering and
     * downloading. Useful for kit-based APIs (e.g. Adobe Fonts) that
     * return every family and weight in the kit.
     */
    transformFaces?: (faces: ParsedFontFace[], definition: FontDefinition) => ParsedFontFace[]

    /**
     * Filter the parsed rules by the requested subsets, using the subset
     * labels in the CSS comments (e.g. `\/\* latin \*\/`). Disable for APIs
     * whose comments are not subset labels (e.g. Fontshare labels rules with
     * the family name).
     *
     * @default true
     */
    filterSubsets?: boolean

    /**
     * Only download these formats, e.g. `['woff2']`. By default every
     * format referenced in the CSS is downloaded.
     */
    formats?: FontFormat[]
}

/**
 * Build the request URL for the Google Fonts CSS2 API
 * (also supported by Bunny Fonts).
 */
export function buildCss2Url(definition: FontDefinition, baseUrl: string): string {
    const family = definition.family.replace(/ /g, '+')
    const hasItalic = definition.styles.includes('italic')
    const axes = hasItalic ? ['ital', 'wght'] : ['wght']
    const tuples = new Set<string>()

    for (const weight of definition.weights) {
        for (const style of definition.styles) {
            tuples.add(hasItalic ? `${style === 'italic' ? '1' : '0'},${weight}` : `${weight}`)
        }
    }

    const axisStr = axes.join(',')
    const tupleStr = [...tuples].sort().join(';')

    return `${baseUrl}?family=${family}:${axisStr}@${tupleStr}&display=${definition.display}`
}

/**
 * Create a font provider for any source that exposes a CSS API returning
 * `@font-face` rules (Google Fonts, Bunny Fonts, Adobe Fonts, Fontshare, ...).
 */
export function createCssApiProvider(options: CssApiProviderOptions): FontProvider {
    const buildUrl = options.buildUrl ?? buildCss2Url

    return {
        name: options.name,

        async resolve(definition, context) {
            const url = buildUrl(definition, options.baseUrl)
            const headers = typeof options.headers === 'function'
                ? options.headers(definition)
                : options.headers ?? { 'User-Agent': WOFF2_USER_AGENT }

            const css = await context.fetchText(url, { headers })
            let faces = context.parseFontFaces(css)

            if (options.transformFaces) {
                faces = options.transformFaces(faces, definition)
            }

            faces = filterFaces(faces, definition, options.name, options.filterSubsets ?? true)

            return downloadFaces(faces, definition, context, headers, options.formats)
        },
    }
}

function filterFaces(
    faces: ParsedFontFace[],
    definition: FontDefinition,
    providerName: string,
    filterSubsets: boolean,
): ParsedFontFace[] {
    if (faces.length === 0) {
        throw new Error(
            `vite-plugin-fonts: ${providerName} returned no @font-face rules for "${definition.family}". ` +
            `Check the family name and requested weights/styles.`,
        )
    }

    // Kit-based APIs (e.g. Adobe Fonts) return every family in the kit, so
    // only keep the requested one. For single-family APIs this is a no-op.
    const familyFaces = faces.filter(
        (face) => face.family.toLowerCase() === definition.family.toLowerCase(),
    )

    if (familyFaces.length === 0) {
        const available = [...new Set(faces.map((face) => face.family))]

        throw new Error(
            `vite-plugin-fonts: ${providerName} returned no @font-face rules for family "${definition.family}". ` +
            `Available families: [${available.join(', ')}].`,
        )
    }

    // Kit-based APIs may also return weights and styles that were not
    // requested. Faces with a weight range (e.g. variable fonts) are always
    // kept, since they cannot be matched against a single requested weight.
    const requestedWeights = definition.weights.map(String)
    const requestedWeightsAreNumeric = requestedWeights.every((weight) => /^\d+$/.test(weight))

    const variantFaces = familyFaces.filter((face) => {
        if (! definition.styles.includes(face.style)) {
            return false
        }

        if (requestedWeightsAreNumeric && /^\d+$/.test(String(face.weight))) {
            return requestedWeights.includes(String(face.weight))
        }

        return true
    })

    if (variantFaces.length === 0) {
        const availableWeights = [...new Set(familyFaces.map((face) => String(face.weight)))]
        const availableStyles = [...new Set(familyFaces.map((face) => face.style))]

        throw new Error(
            `vite-plugin-fonts: ${providerName} returned no @font-face rules matching the requested ` +
            `weights [${requestedWeights.join(', ')}] and styles [${definition.styles.join(', ')}] ` +
            `for "${definition.family}". ` +
            `Available weights: [${availableWeights.join(', ')}], styles: [${availableStyles.join(', ')}].`,
        )
    }

    if (! filterSubsets) {
        // The labels are known not to be subsets, so drop them to keep them
        // out of the generated file names.
        return variantFaces.map((face) => ({ ...face, subset: undefined }))
    }

    // The CSS2 APIs return rules for every available subset regardless of the
    // requested ones, so filter by the subset labels in the response. Rules
    // without a label are kept to stay compatible with unlabelled responses.
    const subsetFaces = variantFaces.filter(
        (face) => ! face.subset || definition.subsets.includes(face.subset),
    )

    if (subsetFaces.length === 0) {
        const available = [...new Set(familyFaces.map((face) => face.subset).filter(Boolean))]

        throw new Error(
            `vite-plugin-fonts: ${providerName} returned no @font-face rules matching the requested ` +
            `subsets [${definition.subsets.join(', ')}] for "${definition.family}". ` +
            `Available subsets: [${available.join(', ')}].`,
        )
    }

    return subsetFaces
}

async function downloadFaces(
    faces: ParsedFontFace[],
    definition: FontDefinition,
    context: FontProviderContext,
    headers: Record<string, string>,
    formats?: FontFormat[],
): Promise<ResolvedFontVariant[]> {
    const variants: ResolvedFontVariant[] = []

    for (const face of faces) {
        const files: ResolvedFontFile[] = []

        for (const src of face.src) {
            if (formats && ! formats.includes(src.format)) {
                continue
            }

            // Some APIs (e.g. Fontshare) emit protocol-relative URLs.
            const url = src.url.startsWith('//') ? `https:${src.url}` : src.url

            files.push({
                source: await context.fetchFile(url, { headers }),
                format: src.format,
                unicodeRange: face.unicodeRange,
                subset: face.subset,
            })
        }

        if (files.length === 0) {
            continue
        }

        files.sort((a, b) => FORMAT_PREFERENCE.indexOf(a.format) - FORMAT_PREFERENCE.indexOf(b.format))

        variants.push({ weight: face.weight, style: face.style, files })
    }

    return sortVariants(variants)
}

function sortVariants(variants: ResolvedFontVariant[]): ResolvedFontVariant[] {
    const weight = (value: string | number): number => {
        const parsed = parseInt(String(value), 10)

        return Number.isNaN(parsed) ? 400 : parsed
    }

    return variants.sort((a, b) => {
        if (weight(a.weight) !== weight(b.weight)) {
            return weight(a.weight) - weight(b.weight)
        }

        if (a.style !== b.style) {
            return a.style.localeCompare(b.style)
        }

        const rangeA = a.files[0]?.unicodeRange ?? ''
        const rangeB = b.files[0]?.unicodeRange ?? ''

        return rangeA.localeCompare(rangeB)
    })
}
