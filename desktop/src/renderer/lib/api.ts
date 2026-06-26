import type { FileNode, PingResponse, StorageInfo } from '@droidwire/shared'
import { API_ENDPOINTS } from '@droidwire/shared'

let baseUrl = ''

export function setBaseUrl(url: string) {
  baseUrl = url
}

export function getBaseUrl(): string {
  return baseUrl
}

export function downloadUrl(filePath: string): string {
  return `${baseUrl}${API_ENDPOINTS.DOWNLOAD}?path=${encodeURIComponent(filePath)}`
}

export function uploadUrl(destPath: string): string {
  return `${baseUrl}${API_ENDPOINTS.UPLOAD}?path=${encodeURIComponent(destPath)}`
}

export async function ping(ip: string, port: number): Promise<PingResponse> {
  const res = await fetch(`http://${ip}:${port}${API_ENDPOINTS.PING}`, {
    signal: AbortSignal.timeout(500),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<PingResponse>
}

export async function listFiles(dirPath: string): Promise<FileNode[]> {
  const res = await fetch(
    `${baseUrl}${API_ENDPOINTS.FILES}?path=${encodeURIComponent(dirPath)}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<FileNode[]>
}

export async function getStorage(): Promise<StorageInfo> {
  const res = await fetch(`${baseUrl}${API_ENDPOINTS.STORAGE}`, {
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<StorageInfo>
}
