// Wireless adb serials are either "ip:port" (manual connect) or mDNS names
// like "adb-XXXX._adb-tls-connect._tcp" (auto-connect); USB serials are plain
export function isWirelessSerial(serial: string): boolean {
  return serial.includes(':') || serial.startsWith('adb-') || serial.includes('_adb-tls-connect')
}

export function TransportIcon({ serial, size = 12, color }: { serial: string; size?: number; color: string }) {
  return isWirelessSerial(serial) ? (
    // Wi-Fi arcs
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 4.5c2.6-2.6 6.4-2.6 9 0" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3.3 6.5c1.5-1.5 3.9-1.5 5.4 0" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="9" r="1" fill={color} />
    </svg>
  ) : (
    // USB trident
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="6" cy="10.3" r="1.1" fill={color} />
      <path d="M6 9.2V1.9" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.8 3.2L6 1.6l1.2 1.6" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7.3L3.4 5.8V5" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3.4" cy="4.1" r="0.95" fill={color} />
      <path d="M6 5.9l2.6-1.5v-.7" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7.75" y="1.9" width="1.7" height="1.7" fill={color} />
    </svg>
  )
}
