# @droidwire/shared

Shared TypeScript types and constants for the Droidwire monorepo.

## Exports

- `FileNode` — file/directory descriptor returned by `/files` endpoint
- `PingResponse` — response shape from `/ping`
- `StorageInfo` — response shape from `/storage`
- `TransferProgress` — transfer state used across main/renderer IPC
- `ConnectionStatus` — union type for device connection state
- `SERVER_PORT`, `FALLBACK_PORTS`, `TETHERING_SUBNETS` — network constants
- `CHUNK_SIZE`, `MAX_CONCURRENT_TRANSFERS` — transfer constants
- `API_ENDPOINTS` — typed endpoint path map
