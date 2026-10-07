import { app } from 'electron'

// desktop/package.json is the single source of truth for the product version.
// electron-vite injects it as __APP_VERSION__ so dev, driver and packaged runs
// all report the same number (app.getVersion() returns Electron's own version
// when the app runs unpackaged).
export const PRODUCT_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()

// GitHub repository that publishes release builds. Update checks, the Help
// menu and the "download" action all derive from these two constants.
export const RELEASES_REPO = 'ajithonmain/droidwire'
export const ISSUES_URL = `https://github.com/${RELEASES_REPO}/issues`
export const RELEASES_LATEST_URL = `https://github.com/${RELEASES_REPO}/releases/latest`
export const REPO_URL = `https://github.com/${RELEASES_REPO}`
