import type { Diagnostics } from '@droidwire/shared'

// What to tell the user while no phone is connected. Android's authorisation
// steps cannot be bypassed from the Mac, so the job here is to say exactly which
// one is outstanding. Kept free of React so the wording logic is testable.

export type ConnectionMode = 'adb' | 'wireless' | 'mtp'

export interface GuideStep {
  title: string
  body: string
}

export interface GuideNotice {
  tone: 'error' | 'warn'
  title: string
  body: string
}

export interface DeviceIssue {
  serial: string
  state: string
}

export function guideTitle(mode: ConnectionMode): string {
  return mode === 'mtp' ? 'Connect via MTP' : mode === 'wireless' ? 'Connect via Wi-Fi' : 'Connect via ADB'
}

export function guideSubtitle(mode: ConnectionMode): string {
  return mode === 'mtp'
    ? 'Follow these steps to share your files over USB'
    : mode === 'wireless'
      ? 'Wireless debugging needs a one-time pairing on the phone (Android 11 or later)'
      : 'Follow these steps to access your device files over USB'
}

export function guideSteps(mode: ConnectionMode): GuideStep[] {
  if (mode === 'mtp') {
    return [
      { title: 'Unlock the phone', body: 'Keep the screen unlocked while connecting. A locked phone shows no files to the Mac.' },
      { title: 'Plug in with a data cable', body: 'Use a USB cable that carries data, not a charge-only cable.' },
      { title: 'Choose File Transfer', body: 'Swipe down on the phone, tap "Charging this device via USB" (or "USB for ..."), and select "File transfer" (also called "Android Auto" or "MTP").' },
      { title: 'Close other file-transfer apps', body: 'Quit Android File Transfer, OpenMTP or similar: only one app can use the phone at a time.' },
    ]
  }
  if (mode === 'wireless') {
    return [
      { title: 'Use the same Wi-Fi network', body: 'The phone and this Mac must be on the same network, and the network must allow devices to talk to each other.' },
      { title: 'Turn on Wireless debugging', body: 'Settings > Developer options > Wireless debugging. (To see Developer options, tap Build number 7 times in Settings > About phone.)' },
      { title: 'Pair', body: 'Tap "Pair device with QR code" or "Pair device with pairing code" on the phone, then use "Pair" here. This is needed once per Mac.' },
    ]
  }
  return [
    { title: 'Enable Developer Options', body: 'On your Android device, go to Settings > About phone. Tap Build number 7 times until you see "You are now a developer".' },
    { title: 'Enable USB Debugging', body: 'Go to Settings > Developer Options and toggle on USB Debugging.' },
    { title: 'Connect via USB & Authorize', body: 'Plug your Android into this Mac. When prompted on your phone, tap Allow and check "Always allow from this computer".' },
  ]
}

export function guideNotices(mode: ConnectionMode, issues: DeviceIssue[], diag: Diagnostics | null): GuideNotice[] {
  const notices: GuideNotice[] = []

  if (mode === 'mtp') {
    if (diag && !diag.mtp.available) {
      notices.push({
        tone: 'error',
        title: 'MTP is not available in this install',
        body: `${diag.mtp.error ?? 'The MTP component failed to load.'} Reinstall Droidwire from the latest release, or use USB or Wi-Fi (ADB) instead.`,
      })
    }
    return notices
  }

  if (diag?.adb.error) {
    notices.push({
      tone: 'error',
      title: "Droidwire's built-in adb could not start",
      body: `${diag.adb.error}. Reinstall Droidwire from the latest release. If it keeps happening, choose Help > Copy Diagnostics and include it in a bug report.`,
    })
  }

  for (const issue of issues) {
    if (issue.state === 'unauthorized') {
      notices.push({
        tone: 'warn',
        title: 'Your phone has not authorized this Mac yet',
        body: 'Look at the phone and tap Allow on the "Allow USB debugging?" prompt (tick "Always allow from this computer"). No prompt? Unplug and replug the cable, or turn USB debugging off and on again.',
      })
    } else if (issue.state === 'offline') {
      notices.push({
        tone: 'warn',
        title: 'The phone is connected but not responding',
        body: 'Unplug and replug the cable, unlock the phone, and if that does not help toggle USB debugging off and on.',
      })
    } else if (issue.state.includes('no permissions')) {
      notices.push({
        tone: 'warn',
        title: 'The phone refused access',
        body: 'Unlock the phone and accept any USB prompt, then replug the cable.',
      })
    } else {
      notices.push({
        tone: 'warn',
        title: `The phone reports "${issue.state}"`,
        body: 'Unlock the phone, accept any prompt on its screen, and replug the cable.',
      })
    }
  }

  // Say each thing once even if two entries (USB + Wi-Fi) report the same problem
  return notices.filter((n, i) => notices.findIndex(m => m.title === n.title) === i)
}
