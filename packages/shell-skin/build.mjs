import { buildPlugin } from '../../scripts/build-plugin.mjs'

await buildPlugin(new URL('.', import.meta.url))
