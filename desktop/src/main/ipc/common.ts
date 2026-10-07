import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'

/** Send to a renderer only if it still exists; a closed window must not throw. */
export function safeSend(target: WebContents | null | undefined, channel: string, payload?: unknown): void {
  if (!target || target.isDestroyed()) return
  try {
    target.send(channel, payload)
  } catch {
    /* window closed between the check and the send */
  }
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) safeSend(win.webContents, channel, payload)
  }
}

/** ipcMain.handle with failures logged to main.log under the channel name. */
export function handle<R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      console.error(`[ipc ${channel}]`, err instanceof Error ? err.message : err)
      throw err
    }
  })
}
