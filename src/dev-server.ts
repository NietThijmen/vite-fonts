import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { FORMAT_MIME } from './types.js'
import type { FontFormat, ResolvedFontFamily } from './types.js'

export const DEV_FONT_ROUTE_PREFIX = '/__fonts'

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
    return typeof value === 'object' && value !== null && 'port' in value
}

/**
 * Resolve the origin of the Vite dev server (e.g. `http://localhost:5173`).
 * Returns `null` when the server is running in middleware mode or has not
 * started listening yet.
 */
export function resolveDevServerOrigin(server: ViteDevServer): string | null {
    const configuredOrigin = server.config.server.origin

    if (configuredOrigin) {
        return configuredOrigin.replace(/\/$/, '')
    }

    const resolved = server.resolvedUrls

    if (resolved) {
        const url = resolved.local[0] ?? resolved.network[0]

        if (url) {
            return url.replace(/\/$/, '')
        }
    }

    const httpServer = server.httpServer

    if (! httpServer) {
        return null
    }

    const address = httpServer.address()

    if (! isAddressInfo(address)) {
        return null
    }

    const protocol = server.config.server.https ? 'https' : 'http'
    const host = address.address === '0.0.0.0' || address.address === '::'
        ? 'localhost'
        : address.address

    return `${protocol}://${host}:${address.port}`
}

export function buildDevUrlMap(
    families: ResolvedFontFamily[],
    fileNames: Map<string, string>,
    origin?: string | null,
): Map<string, string> {
    const prefix = origin
        ? `${origin.replace(/\/$/, '')}${DEV_FONT_ROUTE_PREFIX}`
        : DEV_FONT_ROUTE_PREFIX
    const urlMap = new Map<string, string>()

    for (const family of families) {
        for (const variant of family.variants) {
            for (const file of variant.files) {
                if (! urlMap.has(file.source)) {
                    urlMap.set(file.source, `${prefix}/${fileNames.get(file.source)}`)
                }
            }
        }
    }

    return urlMap
}

export function createFontMiddleware(): {
    middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
    update: (families: ResolvedFontFamily[], fileNames: Map<string, string>) => void
    setReady: (ready: Promise<void>) => void
} {
    let lookup = new Map<string, { source: string, format: FontFormat }>()
    let ready: Promise<void> = Promise.resolve()

    function update(families: ResolvedFontFamily[], fileNames: Map<string, string>): void {
        const newLookup = new Map<string, { source: string, format: FontFormat }>()

        for (const family of families) {
            for (const variant of family.variants) {
                for (const file of variant.files) {
                    const name = fileNames.get(file.source)

                    if (name) {
                        newLookup.set(name, { source: file.source, format: file.format })
                    }
                }
            }
        }

        lookup = newLookup
    }

    function setReady(promise: Promise<void>): void {
        ready = promise
    }

    function middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
        if (! req.url?.startsWith(DEV_FONT_ROUTE_PREFIX + '/')) {
            return next()
        }

        ready.then(() => {
            const name = decodeURIComponent(req.url!.slice(DEV_FONT_ROUTE_PREFIX.length + 1).split('?')[0]!)
            const entry = lookup.get(name)

            if (! entry || ! fs.existsSync(entry.source)) {
                res.statusCode = 404
                res.end('Font not found')

                return
            }

            res.setHeader('Content-Type', FORMAT_MIME[entry.format] ?? 'application/octet-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Cache-Control', 'public, max-age=3600')

            const stream = fs.createReadStream(entry.source)

            stream.on('error', (err) => {
                if (! res.headersSent) {
                    res.statusCode = 500
                }

                res.destroy(err)
            })

            res.on('close', () => {
                stream.destroy()
            })

            stream.pipe(res)
        }, next)
    }

    return { middleware, update, setReady }
}
