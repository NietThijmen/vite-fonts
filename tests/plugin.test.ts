import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import type { ResolvedConfig } from 'vite'
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

    it('emits rewritten extra css from kit providers', async () => {
        const fontSource = path.join(tmpDir, 'fa-solid.woff2')

        fs.writeFileSync(fontSource, Buffer.from('woff2'))
        fs.writeFileSync(path.join(tmpDir, 'main.js'), '')
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<script type="module" src="/main.js"></script>')

        const provider: FontProvider = {
            name: 'fontawesome',
            resolve: async () => ({
                variants: [{
                    family: 'Font Awesome 6 Free',
                    weight: 900,
                    style: 'normal',
                    files: [{
                        source: fontSource,
                        format: 'woff2',
                        url: 'https://ka-f.example/webfonts/solid.woff2?token=abc',
                    }],
                } satisfies ResolvedFontVariant],
                extraCss: '@font-face{font-family:"Font Awesome 6 Free";src:url(https://ka-f.example/webfonts/solid.woff2?token=abc) format("woff2")}.fa-user{--fa:"\\f007"}',
            }),
        }

        await buildWithFonts(tmpDir, {
            inject: false,
            fonts: [defineFont('Font Awesome', provider, { alias: 'font-awesome' })],
        })

        const emittedCss = fs.readFileSync(path.join(tmpDir, 'dist', 'fonts', 'fonts.css'), 'utf-8')

        expect(emittedCss).toContain('.fa-user')
        expect(emittedCss).toContain('font-awesome-6-free-900-normal.woff2')
        expect(emittedCss).not.toContain('ka-f.example')
    })
})

describe('baseUrl override', () => {
    let tmpDir: string

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-fonts-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    async function tagsForBase(options: { base?: string, baseUrl?: string }) {
        const fontSource = path.join(tmpDir, 'inter-400.woff2')

        fs.writeFileSync(fontSource, Buffer.from('woff2'))

        const provider: FontProvider = {
            name: 'dummy',
            resolve: async () => [{
                weight: 400,
                style: 'normal',
                files: [{ source: fontSource, format: 'woff2' }],
            } satisfies ResolvedFontVariant],
        }

        const plugin = fonts({
            inject: true,
            baseUrl: options.baseUrl,
            fonts: [defineFont('Inter', provider)],
        })

        const resolvedConfig = {
            command: 'build',
            root: tmpDir,
            base: options.base ?? '/',
            build: { ssr: false },
        } as ResolvedConfig

        const configResolved = (typeof plugin.configResolved === 'function'
            ? plugin.configResolved
            : plugin.configResolved?.handler) as (config: ResolvedConfig) => void

        configResolved(resolvedConfig)

        const buildStart = (typeof plugin.buildStart === 'function'
            ? plugin.buildStart
            : plugin.buildStart?.handler) as (this: { warn: (message: string) => void }) => Promise<void>

        await buildStart.call({ warn: () => {} })

        const generateBundle = (typeof plugin.generateBundle === 'function'
            ? plugin.generateBundle
            : plugin.generateBundle?.handler) as unknown as (this: { emitFile: () => void }) => void

        generateBundle.call({ emitFile: () => {} })

        const transformIndexHtml = plugin.transformIndexHtml as {
            handler: () => Promise<{ attrs?: Record<string, string>, tag: string }[]>
        }

        return transformIndexHtml.handler()
    }

    it('overrides vite base for injected tags', async () => {
        const tags = await tagsForBase({
            base: '/app/',
            baseUrl: 'https://cdn.example.com/assets/',
        })

        const html = tags.map((tag) => tag.tag === 'link' ? `<link${Object.entries(tag.attrs ?? {}).map(([k, v]) => ` ${k}="${v}"`).join('')}>` : '').join('')

        expect(html).toContain('href="https://cdn.example.com/assets/fonts/fonts.css"')
        expect(html).toContain('href="https://cdn.example.com/assets/fonts/inter-400-normal.woff2"')
    })

    it('falls back to vite base when baseUrl is omitted', async () => {
        const tags = await tagsForBase({ base: '/app/' })

        const html = tags.map((tag) => tag.tag === 'link' ? `<link${Object.entries(tag.attrs ?? {}).map(([k, v]) => ` ${k}="${v}"`).join('')}>` : '').join('')

        expect(html).toContain('href="/app/fonts/fonts.css"')
        expect(html).toContain('href="/app/fonts/inter-400-normal.woff2"')
    })
})
