import { execFile } from 'child_process'
import { callMtp, onMtpWorkerExit, stopMtpWorker } from './mtp-worker-client.ts'
import { createMtpTransport } from './mtp-transport-core.ts'

// macOS's ptpcamerad (feeds Image Capture/Photos) claims every attached MTP
// device's USB interface, making libmtp's claim fail (and it respawns via
// launchd, re-claiming on each device attach). Evict it right before we
// connect - same technique OpenMTP uses; once our session holds the
// interface, its respawn can't take the device back.
function evictPtpcamerad(): Promise<void> {
  return new Promise(resolve => {
    execFile('killall', ['ptpcamerad'], () => resolve()) // exit 1 (not running) is fine
  })
}

export const MtpTransport = createMtpTransport({
  call: callMtp,
  stopWorker: stopMtpWorker,
  onWorkerExit: onMtpWorkerExit,
  evictPtpcamerad,
})
