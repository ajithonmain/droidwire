import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native'
import type { ConnectionStatus } from '@droidwire/shared'
import { SERVER_PORT } from '@droidwire/shared'

export default function HomeScreen() {
  const [serverStatus, setServerStatus] = useState<'stopped' | 'starting' | 'running'>('stopped')
  const [ip, setIp] = useState<string>('')

  useEffect(() => {
    startServer()
  }, [])

  async function startServer() {
    setServerStatus('starting')
    // TODO: integrate react-native-http-server
    // Server binds to all interfaces on SERVER_PORT
    // Placeholder: simulate start
    setServerStatus('running')
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      <Text style={styles.title}>Droidwire</Text>

      <View style={styles.statusCard}>
        <View style={[styles.dot, serverStatus === 'running' ? styles.dotActive : styles.dotInactive]} />
        <Text style={styles.statusText}>
          {serverStatus === 'running' ? 'Server running' : serverStatus === 'starting' ? 'Starting...' : 'Stopped'}
        </Text>
        {serverStatus === 'starting' && <ActivityIndicator color="#00D84A" />}
      </View>

      {ip ? (
        <Text style={styles.ip}>{ip}:{SERVER_PORT}</Text>
      ) : (
        <Text style={styles.hint}>Enable USB tethering on your Android device</Text>
      )}

      <Text style={styles.muted}>Connect Mac via USB cable, then open Droidwire on Mac</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F5F5F5',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: '#00D84A' },
  dotInactive: { backgroundColor: '#FF4444' },
  statusText: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '500',
  },
  ip: {
    fontSize: 22,
    fontFamily: 'monospace',
    color: '#00D84A',
    fontWeight: '600',
  },
  hint: {
    color: '#6B6B6B',
    fontSize: 14,
    textAlign: 'center',
  },
  muted: {
    color: '#6B6B6B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
})
