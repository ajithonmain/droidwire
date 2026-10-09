// ipcRenderer.invoke wraps a handler's error as "Error invoking remote method 'channel': Error: message".
// The channel name means nothing to the user; show just the message.
export function cleanIpcError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
}
