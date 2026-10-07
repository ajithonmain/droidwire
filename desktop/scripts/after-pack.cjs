// electron-builder afterPack hook.
//
// With no Developer ID identity electron-builder skips signing and leaves the
// bundle with Electron's original signature, which no longer matches once the
// app's resources and Info.plist are changed ("code has no resources but
// signature indicates they must be present"). Apple Silicon wants a valid seal
// even on unsigned apps, so seal the finished bundle ad-hoc. This is NOT a
// distribution signature: Gatekeeper still treats the app as unidentified.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (process.env.DROIDWIRE_ADHOC_SIGN !== '1' || context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  ad-hoc sealed ${app}`)
}
