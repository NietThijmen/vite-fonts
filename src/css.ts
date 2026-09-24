import type { FontFormat, ResolvedFontFamily, ResolvedFontFile } from './types.js'

const FORMAT_KEYWORDS: Record<FontFormat, string> = {
    woff2: 'woff2',
    woff: 'woff',
    ttf: 'truetype',
    otf: 'opentype',
    eot: 'embedded-opentype',
}

export type FontUrlMap = Map<string, string>

function generateSrc(files: ResolvedFontFile[], urlMap: FontUrlMap): string {
    return files
        .map((file) => `url("${urlMap.get(file.source) ?? file.source}") format("${FORMAT_KEYWORDS[file.format]}")`)
        .join(',\n    ')
}

export function generateFontFaces(
    family: ResolvedFontFamily,
    urlMap: FontUrlMap,
): string {
    const rules: string[] = []
    const { definition } = family

    for (const variant of family.variants) {
        const rangedFiles = variant.files.filter((f) => f.unicodeRange)
        const nonRangedFiles = variant.files.filter((f) => ! f.unicodeRange)

        // Group files sharing a unicode-range (e.g. a woff2 + woff pair for
        // the same subset) into a single @font-face rule.
        const rangeGroups = new Map<string, ResolvedFontFile[]>()

        for (const file of rangedFiles) {
            const group = rangeGroups.get(file.unicodeRange!) ?? []

            group.push(file)
            rangeGroups.set(file.unicodeRange!, group)
        }

        const familyName = variant.family ?? definition.family

        for (const [unicodeRange, files] of rangeGroups) {
            rules.push([
                '@font-face {',
                `  font-family: "${familyName}";`,
                `  font-style: ${variant.style};`,
                `  font-weight: ${String(variant.weight)};`,
                `  font-display: ${definition.display};`,
                `  src: ${generateSrc(files, urlMap)};`,
                `  unicode-range: ${unicodeRange};`,
                '}',
            ].join('\n'))
        }

        if (nonRangedFiles.length > 0) {
            rules.push([
                '@font-face {',
                `  font-family: "${familyName}";`,
                `  font-style: ${variant.style};`,
                `  font-weight: ${String(variant.weight)};`,
                `  font-display: ${definition.display};`,
                `  src: ${generateSrc(nonRangedFiles, urlMap)};`,
                '}',
            ].join('\n'))
        }
    }

    return rules.join('\n\n')
}

function familyVariableDeclaration(family: ResolvedFontFamily): string {
    const { definition } = family
    const parts = [`"${definition.family}"`, ...definition.fallbacks]

    return `${definition.variable}: ${parts.join(', ')};`
}

export function generateCssVariables(families: ResolvedFontFamily[]): string {
    const lines = families.map((family) => `  ${familyVariableDeclaration(family)}`)

    return [':root {', ...lines, '}'].join('\n')
}

export function generateFontClass(family: ResolvedFontFamily): string {
    const { definition } = family

    return `.font-${definition.alias} {\n  font-family: var(${definition.variable});\n}`
}

const FONT_FILE_RE = /\.(woff2?|ttf|otf|eot)(?:\?|#|$)/i

/**
 * Rewrite downloaded font URLs in provider-supplied CSS, and drop remote
 * font files that were not downloaded (e.g. TTF fallbacks when only WOFF2
 * is kept).
 */
export function rewriteExtraCss(css: string, family: ResolvedFontFamily, urlMap: FontUrlMap): string {
    const replacements = new Map<string, string>()

    for (const variant of family.variants) {
        for (const file of variant.files) {
            const mapped = urlMap.get(file.source)

            if (file.url && mapped) {
                replacements.set(file.url, mapped)
            }
        }
    }

    const rewritten = css.replace(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)(\s*format\(\s*(['"]?)[^'")]*\4\s*\))?/g,
        (full, quote: string, url: string, formatPart: string = '') => {
            const mapped = replacements.get(url)

            if (mapped) {
                return `url(${quote}${mapped}${quote})${formatPart}`
            }

            if (/^https?:\/\//i.test(url) && FONT_FILE_RE.test(url)) {
                return ''
            }

            return full
        },
    )

    return rewritten
        .replace(/src\s*:\s*,+/g, 'src:')
        .replace(/,\s*,+/g, ',')
        .replace(/,\s*;/g, ';')
        .replace(/,\s*}/g, '}')
}

export function generateFontCss(
    families: ResolvedFontFamily[],
    urlMap: FontUrlMap,
): string {
    const parts = families.map((family) => {
        if (family.extraCss) {
            return rewriteExtraCss(family.extraCss, family, urlMap)
        }

        return generateFontFaces(family, urlMap)
    })

    parts.push(generateCssVariables(families))
    parts.push(families.map(generateFontClass).join('\n\n'))

    return parts.join('\n\n') + '\n'
}
