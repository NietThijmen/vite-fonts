import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import fonts, { VIRTUAL_CSS_ID, defineFont } from '../src/index.js'
import type { FontProvider, ResolvedFontVariant } from '../src/types.js'

const dummyProvider: FontProvider = {
    name: 'dummy',
    resolve: async () => [],
}

async function buildWithFonts(root: string, pluginOptions: Parameters<typeof fonts>[0]) {
    return build({
        root,
        logLevel: 'silent',
        build: {
            outDir: 'dist',
            manifest: true,
            rollupOptions: {
                input: path.join(root, 'main.js'),
            },
        },
        plugins: [fonts(pluginOptions)],
    })
}

describe('virtual css module', () => {
    let tmpDir: string

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-fonts-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('is resolved by resolveId', () => {
        const plugin = fonts({ fonts: [defineFont('Inter', dummyProvider)] })
        const resolveId = typeof plugin.resolveId === 'function'
            ? plugin.resolveId
            : plugin.resolveId?.handler

        expect(resolveId?.call({} as never, VIRTUAL_CSS_ID, undefined, { attributes: {}, isEntry: false })).toBe('\0' + VIRTUAL_CSS_ID)
    })

    it('can be imported from js and points at the emitted stylesheet', async () => {
        const fontSource = path.join(tmpDir, 'inter-400.woff2')

        fs.writeFileSync(fontSource, Buffer.from('woff2'))
        fs.writeFileSync(path.join(tmpDir, 'main.js'), `import '${VIRTUAL_CSS_ID}'`)
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<script type="module" src="/main.js"></script>')

        const provider: FontProvider = {
            name: 'dummy',
            resolve: async () => [{
                weight: 400,
                style: 'normal',
                files: [{ source: fontSource, format: 'woff2' }],
            } satisfies ResolvedFontVariant],
        }

        await buildWithFonts(tmpDir, { inject: false, fonts: [defineFont('Inter', provider)] })

        const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'dist', '.vite', 'manifest.json'), 'utf-8'))

        const fontAsset = Object.values(manifest).find(
            (entry): entry is { file: string } => typeof entry === 'object'
                && entry !== null
                && 'file' in entry
                && typeof (entry as { file: string }).file === 'string'
                && (entry as { file: string }).file.endsWith('.woff2'),
        )

        expect(fontAsset).toBeDefined()
        expect(fontAsset?.file).toBe('fonts/inter-400-normal.woff2')

        const emittedCss = fs.readFileSync(path.join(tmpDir, 'dist', 'fonts', 'fonts.css'), 'utf-8')

        expect(emittedCss).toContain('font-family: "Inter"')
        expect(emittedCss).toContain('inter-400-normal.woff2')
    })

    it('emits deterministic names when imported and when injected', async () => {
        const fontSource = path.join(tmpDir, 'inter-400.woff2')

        fs.writeFileSync(fontSource, Buffer.from('woff2'))
        fs.writeFileSync(path.join(tmpDir, 'main.js'), `import '${VIRTUAL_CSS_ID}'`)
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<script type="module" src="/main.js"></script>')

        const provider: FontProvider = {
            name: 'dummy',
            resolve: async () => [{
                weight: 400,
                style: 'normal',
                files: [{ source: fontSource, format: 'woff2' }],
            } satisfies ResolvedFontVariant],
        }

        await buildWithFonts(tmpDir, { inject: true, fonts: [defineFont('Inter', provider)] })

        expect(fs.existsSync(path.join(tmpDir, 'dist', 'fonts', 'inter-400-normal.woff2'))).toBe(true)
        expect(fs.existsSync(path.join(tmpDir, 'dist', 'fonts', 'fonts.css'))).toBe(true)
    })

    it('lists emitted font files and css in the build manifest without virtual import', async () => {
        const fontSource = path.join(tmpDir, 'inter-400.woff2')

        fs.writeFileSync(fontSource, Buffer.from('woff2'))
        fs.writeFileSync(path.join(tmpDir, 'main.js'), '')
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<script type="module" src="/main.js"></script>')

        const provider: FontProvider = {
            name: 'dummy',
            resolve: async () => [{
                weight: 400,
                style: 'normal',
                files: [{ source: fontSource, format: 'woff2' }],
            } satisfies ResolvedFontVariant],
        }

        await buildWithFonts(tmpDir, { inject: true, fonts: [defineFont('Inter', provider)] })

        const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'dist', '.vite', 'manifest.json'), 'utf-8'))
        const assets = Object.values(manifest).filter(
            (entry): entry is { file: string } => typeof entry === 'object'
                && entry !== null
                && 'file' in entry
                && typeof (entry as { file: string }).file === 'string',
        )

        expect(assets.some((asset) => asset.file === 'fonts/inter-400-normal.woff2')).toBe(true)
        expect(assets.some((asset) => asset.file === 'fonts/fonts.css')).toBe(true)
    })
})
