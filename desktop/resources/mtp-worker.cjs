// Runs luck-node-mtp in its own OS process, isolated from the Electron main
// process. libmtp/libusb calls have been observed to SIGSEGV when driven
// from Electron's main thread (its CFRunLoop conflicts with libusb's macOS
// hotplug run loop) — if that happens here, only this worker dies, and the
// parent (mtp-transport.ts) can detect the exit and restart it cleanly.
//
// Protocol: parent sends { id, method, args }, worker replies
// { id, ok: true, result } or { id, ok: false, error }.
// A download/upload progress callback is relayed as { id, progress: [sent, total] }.

// Dev: luck-node-mtp resolves from the repo's node_modules. Packaged app:
// node_modules lives inside app.asar where this forked worker can't reach
// it, so scripts/bundle-native.sh stages the addon (dylibs rewritten to
// @loader_path) next to this file in Resources/ and it's loaded directly.
//
// If the addon cannot be loaded (not built, libmtp missing) the worker still
// starts and answers every call with that load error, so the app can show a
// clear message and ADB keeps working.
let mtp = null
let mtpLoadError = null
let mtpAddonPath = null
try {
  // Packaged app: the addon staged next to this file (its libmtp/libusb are
  // bundled beside it and resolved via @loader_path). Checked first so an
  // installed app can never pick up a node_modules copy from elsewhere.
  const packaged = require('path').join(__dirname, 'luck-node-mtp.node')
  if (require('fs').existsSync(packaged)) {
    mtp = require(packaged)
    mtpAddonPath = packaged
  } else {
    mtp = require('luck-node-mtp') // development checkout
    mtpAddonPath = require.resolve('luck-node-mtp')
  }
} catch (devErr) {
  try {
    mtp = require(require('path').join(__dirname, 'luck-node-mtp.node'))
  } catch (packagedErr) {
    mtpLoadError = `MTP support is unavailable: ${packagedErr instanceof Error ? packagedErr.message : String(packagedErr)}`
  }
}

const fs = require('fs')

// Exit with the parent. Without this an orphaned worker would keep running
// (and keep the phone's USB interface claimed) if the app dies uncleanly.
process.on('disconnect', () => process.exit(0))

process.on('uncaughtException', (err) => {
  try { process.send({ type: 'fatal', error: err.message }) } catch { /* pipe already gone */ }
  process.exit(1)
})

// A transfer is a single blocking native call, so this process cannot read IPC messages while it runs.
// To cancel one cleanly the parent creates this file; the progress callback below looks for it and
// returns 1, which makes libmtp abort the PTP transaction itself. (Killing the process mid-transfer
// instead leaves the phone's MTP responder wedged until the cable is replugged.)
const cancelFlag = process.env.DROIDWIRE_MTP_CANCEL_FILE || null
const clearCancelFlag = () => { if (cancelFlag) { try { fs.rmSync(cancelFlag, { force: true }) } catch { /* nothing to clear */ } } }

function callWithProgress(fn, args, id) {
  clearCancelFlag()
  try {
    return fn(...args, (sent, total) => {
      try { process.send({ id, type: 'progress', sent, total }) } catch { /* parent gone */ }
      return cancelFlag && fs.existsSync(cancelFlag) ? 1 : 0
    })
  } finally {
    clearCancelFlag()
  }
}

process.on('message', (msg) => {
  const { id, method, args } = msg
  // The worker handles one native call at a time — messages sent while a
  // previous call is still running simply wait here until this handler
  // returns. Telling the parent exactly when a call *starts* running (as
  // opposed to when it was *sent*) lets it time out a call that's actually
  // stuck without also timing out calls that are just waiting their turn
  // behind a slow-but-healthy one (e.g. several large image downloads).
  try { process.send({ id, type: 'started' }) } catch { /* parent gone */ }
  try {
    if (method === 'status') {
      // Loading the addon already resolved its libmtp/libusb dependencies, so
      // this is a real "can MTP work from this install" probe
      process.send({ id, type: 'result', ok: true, result: { available: !mtpLoadError, error: mtpLoadError, addon: mtpAddonPath } })
      return
    }
    if (mtpLoadError) throw new Error(mtpLoadError)
    let result
    switch (method) {
      case 'connect':
        result = mtp.connect(...args)
        break
      case 'release':
        result = mtp.release()
        break
      case 'getDeviceInfo':
        result = mtp.getDeviceInfo()
        break
      case 'getList':
        result = mtp.getList(...args)
        break
      case 'get':
        result = mtp.get(...args)
        break
      case 'download':
        result = callWithProgress(mtp.download, args, id)
        break
      case 'upload':
        result = callWithProgress(mtp.upload, args, id)
        break
      case 'del':
        result = mtp.del(...args)
        break
      case 'copy':
        result = mtp.copy(...args)
        break
      case 'move':
        result = mtp.move(...args)
        break
      case 'setFileName':
        result = mtp.setFileName(...args)
        break
      case 'setFolderName':
        result = mtp.setFolderName(...args)
        break
      case 'createFolder':
        result = mtp.createFolder(...args)
        break
      case 'getCurrentDeviceStorageInfo':
        result = mtp.getCurrentDeviceStorageInfo()
        break
      default:
        throw new Error(`Unknown MTP worker method: ${method}`)
    }
    process.send({ id, type: 'result', ok: true, result })
  } catch (err) {
    process.send({ id, type: 'result', ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

process.send({ type: 'ready' })
