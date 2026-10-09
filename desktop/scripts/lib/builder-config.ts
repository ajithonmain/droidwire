// Release configuration for electron-builder, derived from the "build" field of package.json.
//
// Droidwire 1.4.0 is released WITHOUT MTP (USB/ADB and Wi-Fi only): the luck-node-mtp addon, its worker script and
// libmtp are not packaged, and a marker file tells the app that MTP is deliberately absent. The MTP code stays in the
// source tree; `DROIDWIRE_BUNDLE_MTP=1` builds a variant that does ship it (development and a possible future release).

/** Resources that exist only for MTP. Nothing in this list may appear in a no-MTP package. */
export const MTP_ONLY_RESOURCES = ['mtp-worker.cjs', 'luck-node-mtp.node', 'libmtp.9.dylib'] as const

export interface ExtraResource { from: string; to: string }
export interface BuilderBuild { extraResources: ExtraResource[]; files?: string[]; [key: string]: unknown }

export function bundleMtpFromEnv(env: Record<string, string | undefined>): boolean {
  return env.DROIDWIRE_BUNDLE_MTP === '1'
}

export function builderConfig(build: BuilderBuild, opts: { bundleMtp: boolean }): BuilderBuild {
  const config = structuredClone(build)
  const mtp = new Set<string>(MTP_ONLY_RESOURCES)
  config.extraResources = config.extraResources.filter(r => opts.bundleMtp || !mtp.has(r.to))
  // luck-node-mtp is a development dependency and is never packaged; this makes that explicit, so a future change
  // that turns it into a runtime dependency cannot pull the addon (or its vendored libmtp header) into app.asar
  if (!opts.bundleMtp) config.files = [...(config.files ?? []), '!node_modules/luck-node-mtp{,/**}']
  if (!opts.bundleMtp) config.extraResources.push({ from: 'resources/MTP-NOT-INCLUDED.txt', to: 'MTP-NOT-INCLUDED.txt' })
  return config
}
