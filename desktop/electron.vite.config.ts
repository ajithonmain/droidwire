import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// desktop/package.json is the single source of truth for the product version
const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

const sharedAlias = {
  '@droidwire/shared': path.resolve(__dirname, '../shared/types'),
}

// The production page ships a strict Content-Security-Policy (see index.html).
// The dev server additionally needs inline scripts and a websocket for HMR.
const relaxCspForDevServer = {
  name: 'droidwire-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml(html: string): string {
    return html.replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*" />`,
    )
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: { __APP_VERSION__: JSON.stringify(version) },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), relaxCspForDevServer],
    resolve: { alias: sharedAlias },
    css: {
      postcss: {
        plugins: [
          (await import('tailwindcss')).default,
          (await import('autoprefixer')).default,
        ],
      },
    },
  },
})
