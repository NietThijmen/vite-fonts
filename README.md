# Vite font plugin

[![test status](https://github.com/NietThijmen/vite-fonts/actions/workflows/vitest.yml/badge.svg)](https://github.com/NietThijmen/vite-fonts/actions/workflows/vitest.yml)
[![npm version](https://img.shields.io/npm/v/vite-plugin-local-webfonts)](https://www.npmjs.com/package/vite-plugin-local-webfonts)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-local-webfonts)](https://www.npmjs.com/package/vite-plugin-local-webfonts)
[![license](https://img.shields.io/npm/l/vite-plugin-local-webfonts)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/vite-plugin-local-webfonts)](https://bundlephobia.com/package/vite-plugin-local-webfonts)

Download web fonts from [Google Fonts](https://fonts.google.com), [Bunny Fonts](https://fonts.bunny.net), [Fontshare](https://www.fontshare.com), [Adobe Fonts](https://fonts.adobe.com), [Font Awesome](https://fontawesome.com) kits, and other sources into your Vite build output — no external CSS requests at runtime, full privacy, and easy to extend with additional font sources.

## Features

- Downloads font files at build time into `dist/fonts/` (configurable)
- Generates a `fonts.css` stylesheet with `@font-face` rules, CSS variables, and utility classes
- Injects the stylesheet and `<link rel="preload">` tags into your `index.html`
- Serves the fonts from the dev server during development
- Caches downloads in `node_modules/.cache/vite-plugin-fonts` for fast rebuilds
- Built-in providers for Google Fonts, Bunny Fonts, Fontshare, Adobe Fonts, and Font Awesome kits
- Extensible: add any other font source with a few lines of code
- Zero runtime dependencies

## Installation

```sh
npm install -D vite-plugin-local-webfonts
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import fonts, { adobe, bunny, fontawesome, fontshare, google } from 'vite-plugin-local-webfonts'

export default defineConfig({
    plugins: [
        fonts({
            fonts: [
                google('Inter', {
                    weights: [400, 700],
                    styles: ['normal', 'italic'],
                    fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
                }),
                bunny('Roboto', { weights: [400, 700] }),
                fontshare('Satoshi', { weights: [400, 700] }),
                adobe('proxima-nova', 'https://use.typekit.net/abcdefg.css'),
                fontawesome('https://kit.fontawesome.com/xxxxxxxx.js'),
            ],
        }),
    ],
})
```

On `vite build` this emits:

```
dist/
  fonts/
    inter-variable-normal-latin.woff2
    inter-variable-italic-latin.woff2
    roboto-400-normal-latin.woff2
    fonts.css
  index.html   (with <link rel="stylesheet" href="/fonts/fonts.css"> and preload tags injected)
```

The generated `fonts.css` contains the `@font-face` rules plus a CSS variable and a
utility class per family:

```css
:root {
  --font-inter: "Inter", ui-sans-serif, system-ui, sans-serif;
}

.font-inter {
  font-family: var(--font-inter);
}
```

During `vite dev`, the fonts are served from the dev server and injected into the page automatically.

### Using the fonts without the generated `index.html`

If your site is built with Vite but the final HTML is rendered elsewhere (for example by a backend framework), import the generated font CSS from your own CSS or JavaScript with the virtual module:

```css
/* src/style.css */
@import 'virtual:fonts.css';
```

```ts
// src/main.ts
import 'virtual:fonts.css'
```

During development the virtual module serves the live stylesheet from the dev server. In production it returns the generated `@font-face` CSS, which Vite bundles into your own stylesheet. The referenced font files are still emitted to `dist/fonts/` as usual.

When you consume the fonts through the virtual module, disable automatic HTML injection to avoid loading the same CSS twice:

> **Note on relative `base`** — because the virtual module's CSS is bundled into your own stylesheet, font URLs use your configured `base`. With `base: './'` or `base: ''` the URLs are relative to the emitted stylesheet, so they may not resolve correctly if that stylesheet is placed in a subdirectory such as `assets/`. For relative-base deployments, reference `fonts/fonts.css` directly instead of using the virtual module.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import fonts, { google } from 'vite-plugin-local-webfonts'

export default defineConfig({
    plugins: [
        fonts({
            inject: false,
            fonts: [
                google('Inter', { weights: [400, 700] }),
            ],
        }),
    ],
})
```

### Build manifest

All emitted assets — the generated `fonts.css` and every downloaded font file — are registered in Vite's build manifest (`build.manifest`). This makes it straightforward for a backend or custom integration to discover the exact published file names.

## Font options

| Option      | Default            | Description                                                                 |
| ----------- | ------------------ | --------------------------------------------------------------------------- |
| `weights`   | `[400]`            | Weights to download, e.g. `[400, 700]`.                                       |
| `styles`    | `['normal']`       | `'normal'` and/or `'italic'`.                                                 |
| `subsets`   | `['latin']`        | Subsets to keep, e.g. `['latin', 'latin-ext']`.                               |
| `display`   | `'swap'`           | The `font-display` value.                                                     |
| `preload`   | `true`             | Inject `<link rel="preload">` tags for the WOFF2 files.                       |
| `fallbacks` | `[]`               | Fallback families appended in the CSS variable, e.g. `['system-ui', 'sans-serif']`. |
| `alias`     | slug of the family | Used for the utility class (`.font-{alias}`).                                 |
| `variable`  | `--font-{alias}`   | The CSS variable holding the font stack. Must start with `--`.                |

## Plugin options

| Option        | Default                                    | Description                                          |
| ------------- | ------------------------------------------ | ---------------------------------------------------- |
| `fonts`       | —                                          | Font definitions (required).                          |
| `outputDir`   | `'fonts'`                                  | Directory inside the build output for fonts and CSS.  |
| `cssFileName` | `'fonts.css'`                              | Name of the generated stylesheet.                     |
| `cacheDir`    | `'node_modules/.cache/vite-plugin-fonts'`  | Where downloads are cached.                           |
| `inject`      | `true`                                     | Inject stylesheet/preload tags into `index.html`.     |
| `dev`         | `true`                                     | Serve and inject fonts during development.            |
| `baseUrl`     | Vite's `base`                              | Public base URL for the stylesheet and font files.    |

## Built-in providers

| Provider    | Helper                                    | Notes                                                        |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| Google Fonts | `google(family, options?)`               | Uses the CSS2 API.                                            |
| Bunny Fonts | `bunny(family, options?)`                | GDPR-friendly drop-in replacement for Google Fonts.           |
| Fontshare   | `fontshare(family, options?)`            | Downloads WOFF2 only.                                         |
| Adobe Fonts | `adobe(family, kitUrl, options?)`        | Requires your kit URL, e.g. `https://use.typekit.net/xyz.css`. |
| Font Awesome | `fontawesome(kitUrl, options?)`          | Kit JS/CSS URL or kit token. Downloads webfonts and icon CSS.  |
| Font Awesome | `fontawesome(family, kitUrl, options?)`  | Same as Adobe: keep one family from the kit.                   |

Each provider also exports its underlying `FontProvider` (`googleProvider`,
`bunnyProvider`, `fontshareProvider`, `adobeProvider(kitUrl)`,
`fontawesomeProvider(kitUrl)`) in case you want to reuse it with `defineFont`
directly.

### Font Awesome kits

Font Awesome kits are the same idea as Adobe Fonts kits: one URL serves CSS
that points at webfont files. `fontawesome()` reuses that kit flow and also
keeps the icon classes (`.fa-solid`, `.fa-user`, …) so `<i class="fa-solid fa-user"></i>`
keeps working after the files are local.

```ts
// Easiest: pass the embed URL (or just the kit token). Every family in the
// kit is downloaded, and the icon CSS is rewritten onto the local files.
fontawesome('https://kit.fontawesome.com/xxxxxxxx.js')
fontawesome('xxxxxxxx')

// CSS-only embed or a versioned stylesheet also works:
fontawesome('https://use.fontawesome.com/releases/v6.7.2/css/all.css')

// One family, same shape as adobe():
fontawesome('Font Awesome 6 Free', 'https://kit.fontawesome.com/xxxxxxxx.js', {
    weights: [400, 900],
})
```

The kit must use **Web Fonts (CSS)**. SVG+JS kits have no `@font-face` rules to
download — switch the kit's technology in the Font Awesome settings.

If the kit limits allowed domains, pass that site as `origin`. It is sent as
`Origin` and `Referer` so the restricted download is allowed at build time:

```ts
fontawesome('https://kit.fontawesome.com/xxxxxxxx.js', {
    origin: 'https://example.com',
})
```

A bare host (`example.com`) is treated as `https://example.com`.

Pass `{ icons: false }` if you only want the webfont files and generated
`@font-face` rules, without the icon stylesheet.

## Adding font sources

Any source that serves CSS with `@font-face` rules can be added with
`createCssApiProvider` — no changes to the plugin core required:

```ts
import fonts, { createCssApiProvider, defineFont } from 'vite-plugin-local-webfonts'

const myFonts = createCssApiProvider({
    name: 'my-fonts',
    baseUrl: 'https://fonts.example.com/css2', // any Google-compatible CSS2 API
})

export default defineConfig({
    plugins: [
        fonts({
            fonts: [
                defineFont('My Font', myFonts, { weights: [400, 700] }),
            ],
        }),
    ],
})
```

### `createCssApiProvider` options

| Option           | Default                       | Description                                                              |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `name`           | —                             | Provider name, used in error messages.                                    |
| `baseUrl`        | —                             | Base URL of the CSS API.                                                  |
| `buildUrl`       | Google CSS2 URL builder       | Build the request URL for a font definition.                              |
| `headers`        | WOFF2-capable user agent      | Headers for CSS and font file requests (object or function).              |
| `transformFaces` | —                             | Post-process parsed `@font-face` rules before filtering and downloading.  |
| `filterSubsets`  | `true`                        | Filter rules by requested subsets using the CSS comment labels.           |
| `formats`        | all                           | Only download these formats, e.g. `['woff2']`.                            |

### Fully custom providers

For sources without a CSS API, implement the `FontProvider` interface directly:

```ts
import type { FontProvider } from 'vite-plugin-local-webfonts'

const myCdnProvider: FontProvider = {
    name: 'my-cdn',
    async resolve(definition, context) {
        const variants = []

        for (const weight of definition.weights) {
            const url = `https://cdn.example.com/${definition.family}-${weight}.woff2`

            variants.push({
                weight,
                style: 'normal',
                files: [{
                    source: await context.fetchFile(url), // downloaded & cached
                    format: 'woff2',
                }],
            })
        }

        return variants
    },
}

defineFont('My Font', myCdnProvider, { weights: [400, 700] })
```

The `context` provides `fetchText(url)` (cached text download), `fetchFile(url)`
(cached binary download, resolves to the local file path), `parseFontFaces(css)`
(the built-in `@font-face` parser), and `warn(message)`.

## How it works

1. For each configured family, the provider's CSS API is fetched (with a
   WOFF2-capable user agent for Google/Bunny) and the `@font-face` rules are parsed.
2. Rules are filtered to the requested family, weights, styles, and subsets.
3. Referenced font files are downloaded into the cache directory.
4. On build, files are emitted to `dist/<outputDir>/` with stable, readable names
   (`inter-variable-normal-latin.woff2`) and a `fonts.css` stylesheet is generated
   with relative URLs, so it works with any `base` configuration.
5. The stylesheet link and preload tags are injected into `index.html`.
6. In dev, the same flow serves files from the dev server under `/__fonts/`, using the dev server's absolute origin (e.g. `http://localhost:5173/__fonts/...`).

## License

MIT
