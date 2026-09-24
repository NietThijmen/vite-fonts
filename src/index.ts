import fonts from './plugin.js'

export { fonts }
export default fonts

export { VIRTUAL_CSS_ID } from './plugin.js'
export { defineFont } from './config.js'
export { parseFontFaceCss } from './css-parser.js'
export { buildCss2Url, createCssApiProvider } from './providers/css-api.js'
export {
    adobe,
    adobeProvider,
    bunny,
    bunnyProvider,
    fontawesome,
    fontawesomeProvider,
    fontshare,
    fontshareProvider,
    google,
    googleProvider,
} from './providers/index.js'

export type { CssApiProviderOptions } from './providers/css-api.js'
export type { FontAwesomeKitConfig, FontAwesomeOptions } from './providers/fontawesome.js'
export type {
    FontDefinition,
    FontDisplay,
    FontFormat,
    FontOptions,
    FontProvider,
    FontProviderContext,
    FontProviderResult,
    FontsPluginOptions,
    FontStyle,
    FontWeight,
    ParsedFontFace,
    ParsedFontSrc,
    ResolvedFontFamily,
    ResolvedFontFile,
    ResolvedFontVariant,
} from './types.js'
