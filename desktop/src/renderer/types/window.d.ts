import type { DroidwireAPI } from '@droidwire/shared'

declare global {
  interface Window {
    droidwire: DroidwireAPI
  }

  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag'
    }
  }
}

export {}
