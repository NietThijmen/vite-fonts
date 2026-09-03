import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_CACHE_DIR = 'node_modules/.cache/vite-plugin-fonts'

export function resolveCacheDir(projectRoot: string, cacheDir?: string): string {
    const dir = cacheDir ?? path.resolve(projectRoot, DEFAULT_CACHE_DIR)

    fs.mkdirSync(dir, { recursive: true })

    return dir
}

export function cacheKey(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

function readCache(cacheDir: string, key: string): Buffer | undefined {
    const filePath = path.join(cacheDir, key)

    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined
}

function writeCache(cacheDir: string, key: string, data: Buffer | string): void {
    fs.writeFileSync(path.join(cacheDir, key), data)
}

async function fetchOrThrow(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, init)

    if (! response.ok) {
        throw new Error(
            `vite-plugin-fonts: Failed to fetch "${url}": ${response.status} ${response.statusText}`,
        )
    }

    return response
}

export async function fetchAndCache(
    url: string,
    cacheDir: string,
    init?: RequestInit,
): Promise<Buffer> {
    const key = cacheKey(url)
    const cached = readCache(cacheDir, key)

    if (cached) {
        return cached
    }

    const response = await fetchOrThrow(url, init)
    const buffer = Buffer.from(await response.arrayBuffer())

    writeCache(cacheDir, key, buffer)

    return buffer
}

export async function fetchTextAndCache(
    url: string,
    cacheDir: string,
    init?: RequestInit,
): Promise<string> {
    const key = cacheKey(url + ':text')
    const cached = readCache(cacheDir, key)

    if (cached) {
        return cached.toString('utf-8')
    }

    const response = await fetchOrThrow(url, init)
    const text = await response.text()

    writeCache(cacheDir, key, text)

    return text
}
