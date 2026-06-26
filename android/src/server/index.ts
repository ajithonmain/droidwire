import { SERVER_PORT, FALLBACK_PORTS, ANDROID_ROOT, CHUNK_SIZE } from '@droidwire/shared'
import type { FileNode, PingResponse, StorageInfo } from '@droidwire/shared'

// TODO: replace with actual react-native-http-server integration
// Placeholder types for server instance
interface ServerInstance {
  stop: () => Promise<void>
}

let activeServer: ServerInstance | null = null
let activePort: number = SERVER_PORT

export async function startServer(): Promise<number> {
  const ports = [SERVER_PORT, ...FALLBACK_PORTS]
  for (const port of ports) {
    try {
      // TODO: HttpServer.start({ port, root: ANDROID_ROOT })
      activePort = port
      return port
    } catch {
      continue
    }
  }
  throw new Error('No available port')
}

export async function stopServer(): Promise<void> {
  if (activeServer) {
    await activeServer.stop()
    activeServer = null
  }
}

export function getActivePort(): number {
  return activePort
}
