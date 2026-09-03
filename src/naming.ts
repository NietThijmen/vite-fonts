import { cacheKey } from './cache.js'
import { familyToSlug } from './config.js'
import type { ResolvedFontFamily } from './types.js'

/**
 * Assign a stable, readable file name to every downloaded font file.
 *
 * Names look like `inter-400-normal-latin.woff2`. When a single file backs
 * multiple weights (variable fonts served by the Google and Bunny CSS APIs),
 * the weight token becomes `variable`, e.g. `inter-variable-normal-latin.woff2`.
 *
 * Files are deduplicated by their source path, and in the unlikely event of a
 * name collision between different files a short content hash is appended.
 */
export function assignFileNames(families: ResolvedFontFamily[]): Map<string, string> {
    const names = new Map<string, string>()
    const used = new Map<string, string>()
    const sourceWeightMap = buildSourceWeightMap(families)

    for (const family of families) {
        const slug = familyToSlug(family.definition.family)

        for (const variant of family.variants) {
            for (const file of variant.files) {
                if (names.has(file.source)) {
                    continue
                }

                const shared = (sourceWeightMap.get(file.source)?.get(variant.style)?.size ?? 0) > 1
                const weight = shared
                    ? 'variable'
                    : String(variant.weight).replace(/\s+/g, '-')
                const parts = [slug, weight, variant.style]

                if (file.subset) {
                    parts.push(file.subset)
                }

                const ext = `.${file.format}`
                let name = parts.join('-') + ext
                const existing = used.get(name)

                if (existing !== undefined && existing !== file.source) {
                    name = `${parts.join('-')}-${cacheKey(file.source).slice(0, 8)}${ext}`
                }

                used.set(name, file.source)
                names.set(file.source, name)
            }
        }
    }

    return names
}

function buildSourceWeightMap(
    families: ResolvedFontFamily[],
): Map<string, Map<string, Set<string>>> {
    const sourceWeightMap = new Map<string, Map<string, Set<string>>>()

    for (const family of families) {
        for (const variant of family.variants) {
            for (const file of variant.files) {
                if (! sourceWeightMap.has(file.source)) {
                    sourceWeightMap.set(file.source, new Map())
                }

                const styleWeights = sourceWeightMap.get(file.source)!

                if (! styleWeights.has(variant.style)) {
                    styleWeights.set(variant.style, new Set())
                }

                styleWeights.get(variant.style)!.add(String(variant.weight))
            }
        }
    }

    return sourceWeightMap
}
