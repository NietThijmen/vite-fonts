# Vite font plugin

Download web fonts from [Google Fonts](https://fonts.google.com), [Bunny Fonts](https://fonts.bunny.net), [Fontshare](https://www.fontshare.com), [Adobe Fonts](https://fonts.adobe.com), and other sources into your Vite build output — no external CSS requests at runtime, full privacy, and easy to extend with additional font sources.

## Features

- Downloads font files at build time into `dist/fonts/` (configurable)
- Generates a `fonts.css` stylesheet with `@font-face` rules, CSS variables, and utility classes
- Injects the stylesheet and `<link rel="preload">` tags into your `index.html`
- Serves the fonts from the dev server during development
- Caches downloads in `node_modules/.cache/vite-plugin-fonts` for fast rebuilds
- Built-in providers for Google Fonts, Bunny Fonts, Fontshare, and Adobe Fonts
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
import fonts, { adobe, bunny, fontshare, google } from 'vite-plugin-local-webfonts'

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

## Built-in providers

| Provider    | Helper                                    | Notes                                                        |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| Google Fonts | `google(family, options?)`               | Uses the CSS2 API.                                            |
| Bunny Fonts | `bunny(family, options?)`                | GDPR-friendly drop-in replacement for Google Fonts.           |
| Fontshare   | `fontshare(family, options?)`            | Downloads WOFF2 only.                                         |
| Adobe Fonts | `adobe(family, kitUrl, options?)`        | Requires your kit URL, e.g. `https://use.typekit.net/xyz.css`. |

Each provider also exports its underlying `FontProvider` (`googleProvider`,
`bunnyProvider`, `fontshareProvider`, `adobeProvider(kitUrl)`) in case you want
to reuse it with `defineFont` directly.

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
6. In dev, the same flow serves files from the dev server under `/__fonts/`.

## License

MIT
