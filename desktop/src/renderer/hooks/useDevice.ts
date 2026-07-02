import { useState, useEffect, useRef, useCallback } from 'react'
import type { ConnectionStatus, StorageInfo } from '@droidwire/shared'
import { getStorage } from '../lib/api'

export interface DeviceInfo {
  name: string
  battery: number
  serial: string
}

const POLL_CONNECTED_MS = 5000
const POLL_DISCONNECTED_MS = 3000

export function useDevice() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [safeToUnplug, setSafeToUnplug] = useState(false)

  const mounted = useRef(true)
  const pauseUntil = useRef(0)
  const deviceRef = useRef<DeviceInfo | null>(null)
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync with state (avoids check() recreating on every device change)
  const setDeviceSync = (d: DeviceInfo | null) => {
    deviceRef.current = d
    setDevice(d)
  }

  const scheduleNext = useCallback((connected: boolean) => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    if (!mounted.current) return
    intervalRef.current = setTimeout(check, connected ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS)
  }, [])

  const check = useCallback(async () => {
    if (!mounted.current) return
    if (Date.now() < pauseUntil.current) {
      scheduleNext(false)
      return
    }
    try {
      const devices = await window.droidwire.getDevices()
      if (!mounted.current) return

      const online = devices.filter(d => d.state === 'device')
      if (online.length === 0) {
        setStatus('disconnected')
        setDeviceSync(null)
        setStorage(null)
        scheduleNext(false)
        return
      }

      const wasConnected = deviceRef.current !== null
      const info = await window.droidwire.getDeviceInfo()
      if (!mounted.current) return

      setDeviceSync({ name: info.name, battery: info.battery, serial: online[0].serial })
      setStatus('connected')

      if (!wasConnected) {
        getStorage().then(s => { if (mounted.current) setStorage(s) }).catch(() => {})
      }
      scheduleNext(true)
    } catch {
      if (mounted.current) {
        setStatus('disconnected')
        setDeviceSync(null)
        scheduleNext(false)
      }
    }
  }, [scheduleNext])

  useEffect(() => {
    mounted.current = true
    check()
    return () => {
      mounted.current = false
      if (intervalRef.current) clearTimeout(intervalRef.current)
    }
  }, [check])

  const disconnect = useCallback(() => {
    pauseUntil.current = Date.now() + 5000
    setDeviceSync(null)
    setStorage(null)
    setStatus('disconnected')
    setSafeToUnplug(true)
    setTimeout(() => {
      if (mounted.current) setSafeToUnplug(false)
    }, 3000)
  }, [])

  const rescan = useCallback(() => {
    pauseUntil.current = 0
    if (intervalRef.current) clearTimeout(intervalRef.current)
    check()
  }, [check])

  return { status, device, storage, safeToUnplug, disconnect, rescan }
}
