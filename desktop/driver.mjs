import { _electron as electron } from 'playwright-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = '/Users/ajithmjose/Documents/droidwire/desktop'
const SHOT_DIR = '/tmp/droidwire-shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = '/Users/ajithmjose/Documents/droidwire/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

async function main() {
  console.log('Launching Droidwire...')
  const app = await electron.launch({
    executablePath: electronBin,
    args: [path.join(APP_DIR, 'out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 30_000,
  })

  console.log('Waiting for window...')
  await new Promise(r => setTimeout(r, 5000))

  const windows = app.windows()
  console.log('Windows:', windows.length)
  for (const w of windows) console.log(' ', w.url())

  const page = windows.find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow()

  const shot1 = path.join(SHOT_DIR, '01-initial.png')
  await page.screenshot({ path: shot1 })
  console.log('Screenshot:', shot1)

  // Check what's rendered
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '(empty)')
  console.log('Body text preview:', bodyText.substring(0, 200))

  await app.close()
  console.log('Done.')
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
