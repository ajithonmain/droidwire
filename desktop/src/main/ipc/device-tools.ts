import type { BatteryDetail, DeviceDetail, InstalledApp, MountInfo } from '@droidwire/shared'
import { handle } from './common.ts'
import { resolveContext } from '../device-manager.ts'
import { adbExec, adbShell } from '../adb-transport.ts'
import { assertBoolean } from '../lib/ipc-validate.ts'

// ADB-only device inspection (battery, device info, mounts, installed apps).

const BATTERY_STATUS: Record<string, string> = {
  '1': 'Unknown', '2': 'Charging', '3': 'Discharging', '4': 'Not charging', '5': 'Full',
}
const BATTERY_HEALTH: Record<string, string> = {
  '1': 'Unknown', '2': 'Good', '3': 'Overheat', '4': 'Dead',
  '5': 'Over voltage', '6': 'Failure', '7': 'Cold',
}

function adbContext(ctxRaw: unknown): { serial: string } {
  const ctx = resolveContext(ctxRaw)
  if (ctx.transport !== 'adb') throw new Error('Device tools need an ADB connection')
  return ctx
}

export function registerDeviceToolHandlers(): void {
  handle('adb:battery-detail', async (_e, ctxRaw): Promise<BatteryDetail> => {
    const { serial } = adbContext(ctxRaw)
    const out = await adbShell(serial, 'dumpsys battery')
    const grab = (re: RegExp) => out.match(re)?.[1]?.trim() ?? null
    const level = parseInt(grab(/level:\s*(\d+)/) ?? '', 10)
    const temp = grab(/temperature:\s*(-?\d+)/)
    let voltageMv: number | null = null
    const volt = grab(/voltage:\s*(\d+)/)
    if (volt) {
      voltageMv = parseInt(volt, 10)
      // Some devices (e.g. Pixels) report microvolts - normalize to mV
      if (voltageMv > 100_000) voltageMv = Math.round(voltageMv / 1000)
    }
    const ac = /AC powered:\s*true/.test(out)
    const usb = /USB powered:\s*true/.test(out)
    const wireless = /Wireless powered:\s*true/.test(out)
    return {
      level: Number.isNaN(level) ? -1 : level,
      status: BATTERY_STATUS[grab(/status:\s*(\d+)/) ?? ''] ?? 'Unknown',
      health: BATTERY_HEALTH[grab(/health:\s*(\d+)/) ?? ''] ?? 'Unknown',
      temperatureC: temp ? parseInt(temp, 10) / 10 : null,
      voltageMv,
      technology: grab(/technology:\s*(.+)/),
      powerSource: ac ? 'AC' : wireless ? 'Wireless' : usb ? 'USB' : 'Battery',
    }
  })

  handle('adb:device-detail', async (_e, ctxRaw): Promise<DeviceDetail> => {
    const { serial } = adbContext(ctxRaw)
    const out = await adbShell(serial, 'getprop')
    const prop = (key: string) =>
      out.match(new RegExp(`\\[${key.replace(/\./g, '\\.')}\\]:\\s*\\[([^\\]]*)\\]`))?.[1] ?? ''
    return {
      model: prop('ro.product.model'),
      manufacturer: prop('ro.product.manufacturer'),
      androidVersion: prop('ro.build.version.release'),
      sdk: prop('ro.build.version.sdk'),
      buildId: prop('ro.build.id'),
      serial,
    }
  })

  handle('adb:storage-detail', async (_e, ctxRaw): Promise<MountInfo[]> => {
    const { serial } = adbContext(ctxRaw)
    const out = await adbShell(serial, 'df -k /sdcard /data /system')
    const mounts: MountInfo[] = []
    const seen = new Set<string>()
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 6 || parts[0] === 'Filesystem') continue
      const total = parseInt(parts[1], 10) * 1024
      const used = parseInt(parts[2], 10) * 1024
      const free = parseInt(parts[3], 10) * 1024
      const mount = parts[parts.length - 1]
      if (Number.isNaN(total) || total <= 0 || seen.has(mount)) continue
      seen.add(mount)
      mounts.push({ mount, total, used, free })
    }
    return mounts
  })

  handle('adb:list-apps', async (_e, includeSystemRaw, ctxRaw): Promise<InstalledApp[]> => {
    const includeSystem = assertBoolean(includeSystemRaw, 'includeSystem')
    const { serial } = adbContext(ctxRaw)
    const args = ['shell', 'pm', 'list', 'packages', '-f']
    if (!includeSystem) args.push('-3')
    const out = await adbExec(serial, args, { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
    const apps: InstalledApp[] = []
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^package:(.+)=([^=]+)$/)
      if (m) apps.push({ apkPath: m[1], pkg: m[2] })
    }
    return apps.sort((a, b) => a.pkg.localeCompare(b.pkg))
  })
}
