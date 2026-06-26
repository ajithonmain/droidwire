import { useState, useEffect, useRef, useCallback } from 'react'
import type { ConnectionStatus, StorageInfo } from '@droidwire/shared'
import { TETHERING_SUBNETS, SERVER_PORT } from '@droidwire/shared'
import { ping, setBaseUrl, getStorage } from '../lib/api'

export interface DeviceInfo {
  name: string
  battery: number
  ip: string
}

export function useDevice() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const scanning = useRef(false)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  const scheduleReconnect = useCallback((fn: () => void) => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    reconnectTimer.current = setTimeout(fn, 3000)
  }, [])

  const scan = useCallback(async () => {
    if (scanning.current || !mounted.current) return
    scanning.current = true
    if (mounted.current) setStatus('connecting')

    for (const subnet of TETHERING_SUBNETS) {
      // scan .1 through .20 first (most common USB tethering IPs), then rest
      const prioritized = [
        ...Array.from({ length: 20 }, (_, i) => i + 1),
        ...Array.from({ length: 234 }, (_, i) => i + 21),
      ]
      for (const last of prioritized) {
        if (!mounted.current) { scanning.current = false; return }
        const ip = `${subnet}.${last}`
        try {
          const data = await ping(ip, SERVER_PORT)
          if (!mounted.current) { scanning.current = false; return }
          setBaseUrl(`http://${ip}:${SERVER_PORT}`)
          setDevice({ name: data.device, battery: data.battery, ip })
          setStatus('connected')
          scanning.current = false
          getStorage().then(s => { if (mounted.current) setStorage(s) }).catch(() => {})
          return
        } catch {
          // not this one
        }
      }
    }

    if (mounted.current) {
      setStatus('disconnected')
      setDevice(null)
      scanning.current = false
      scheduleReconnect(scan)
    }
  }, [scheduleReconnect])

  const onDisconnect = useCallback(() => {
    if (!mounted.current) return
    setStatus('reconnecting')
    setDevice(null)
    setStorage(null)
    scheduleReconnect(scan)
  }, [scan, scheduleReconnect])

  const rescan = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    scanning.current = false
    scan()
  }, [scan])

  useEffect(() => {
    mounted.current = true
    scan()
    return () => {
      mounted.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [scan])

  return { status, device, storage, rescan, onDisconnect }
}
