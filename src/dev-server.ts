import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { FORMAT_MIME } from './types.js'
import type { FontFormat, ResolvedFontFamily } from './types.js'

export const DEV_FONT_ROUTE_PREFIX = '/__fonts'

export function buildDevUrlMap(
    families: ResolvedFontFamily[],
    fileNames: Map<string, string>,
): Map<string, string> {
    const urlMap = new Map<string, string>()

    for (const family of families) {
        for (const variant of family.variants) {
            for (const file of variant.files) {
                if (! urlMap.has(file.source)) {
                    urlMap.set(file.source, `${DEV_FONT_ROUTE_PREFIX}/${fileNames.get(file.source)}`)
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
