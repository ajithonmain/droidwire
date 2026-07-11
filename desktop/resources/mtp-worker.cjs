// Runs luck-node-mtp in its own OS process, isolated from the Electron main
// process. libmtp/libusb calls have been observed to SIGSEGV when driven
// from Electron's main thread (its CFRunLoop conflicts with libusb's macOS
// hotplug run loop) — if that happens here, only this worker dies, and the
// parent (mtp-transport.ts) can detect the exit and restart it cleanly.
//
// Protocol: parent sends { id, method, args }, worker replies
// { id, ok: true, result } or { id, ok: false, error }.
// A download/upload progress callback is relayed as { id, progress: [sent, total] }.

const mtp = require('luck-node-mtp')

process.on('uncaughtException', (err) => {
  try { process.send({ type: 'fatal', error: err.message }) } catch { /* pipe already gone */ }
  process.exit(1)
})

function callWithProgress(fn, args, id) {
  const cbIndex = args.length
  return fn(...args, (sent, total) => {
    try { process.send({ id, type: 'progress', sent, total }) } catch { /* parent gone */ }
  })
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
