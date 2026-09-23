import { describe, expect, it } from 'vitest'
import type { ViteDevServer } from 'vite'
import { buildDevUrlMap, DEV_FONT_ROUTE_PREFIX, resolveDevServerOrigin } from '../src/dev-server.js'
import type { ResolvedFontFamily } from '../src/types.js'

function createFamily(source: string): ResolvedFontFamily {
    return {
        definition: {
            family: 'Inter',
            provider: { name: 'dummy', resolve: async () => [] },
            alias: 'inter',
            variable: '--font-inter',
            weights: [400],
            styles: ['normal'],
            subsets: ['latin'],
            display: 'swap',
            preload: true,
            fallbacks: [],
        },
        variants: [{
            weight: 400,
            style: 'normal',
            files: [{ source, format: 'woff2' }],
        }],
    }
}

describe('buildDevUrlMap', () => {
    const families = [createFamily('/cache/inter-400.woff2')]
    const fileNames = new Map([['/cache/inter-400.woff2', 'inter-400-normal.woff2']])

    it('uses the relative route prefix by default', () => {
        const map = buildDevUrlMap(families, fileNames)

        expect(map.get('/cache/inter-400.woff2')).toBe(`${DEV_FONT_ROUTE_PREFIX}/inter-400-normal.woff2`)
    })

    it('prefixes URLs with the dev server origin when provided', () => {
        const map = buildDevUrlMap(families, fileNames, 'http://localhost:5173')

        expect(map.get('/cache/inter-400.woff2')).toBe('http://localhost:5173/__fonts/inter-400-normal.woff2')
    })

    it('strips a trailing slash from the origin', () => {
        const map = buildDevUrlMap(families, fileNames, 'https://localhost:5173/')

        expect(map.get('/cache/inter-400.woff2')).toBe('https://localhost:5173/__fonts/inter-400-normal.woff2')
    })
})

describe('resolveDevServerOrigin', () => {
    it('prefers the configured server.origin', () => {
        const server = {
            resolvedUrls: null,
            httpServer: null,
            config: { server: { origin: 'https://example.com/' } },
        } as unknown as ViteDevServer

        expect(resolveDevServerOrigin(server)).toBe('https://example.com')
    })

    it('returns the first local resolved URL', () => {
        const server = {
            resolvedUrls: { local: ['http://localhost:5173/'], network: [] },
            httpServer: null,
            config: { server: {} },
        } as unknown as ViteDevServer

        expect(resolveDevServerOrigin(server)).toBe('http://localhost:5173')
    })

    it('falls back to the httpServer address', () => {
        const server = {
            resolvedUrls: null,
            httpServer: { address: () => ({ address: '127.0.0.1', port: 3000 }) },
            config: { server: {} },
        } as unknown as ViteDevServer

        expect(resolveDevServerOrigin(server)).toBe('http://127.0.0.1:3000')
    })

    it('uses https when the server is configured for HTTPS', () => {
        const server = {
            resolvedUrls: null,
            httpServer: { address: () => ({ address: '0.0.0.0', port: 5173 }) },
            config: { server: { https: true } },
        } as unknown as ViteDevServer

        expect(resolveDevServerOrigin(server)).toBe('https://localhost:5173')
    })

    it('returns null when the server has no address', () => {
        const server = {
            resolvedUrls: null,
            httpServer: null,
            config: { server: {} },
        } as unknown as ViteDevServer

        expect(resolveDevServerOrigin(server)).toBeNull()
    })
})
