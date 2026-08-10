export const IPC = {
  screenshots: {
    getByDate: 'screenshots:get-by-date',
    getAvailableDates: 'screenshots:get-available-dates',
    getDayBounds: 'screenshots:get-day-bounds',
    getByTimeRange: 'screenshots:get-by-time-range',
    copyToClipboard: 'screenshots:copy-to-clipboard',
    saveAs: 'screenshots:save-as',
    revealInFinder: 'screenshots:reveal-in-finder'
  },
  usage: {
    getByDate: 'usage:get-by-date'
  },
  apps: {
    getRunning: 'apps:get-running',
    pickApplication: 'apps:pick-application',
    isAvailable: 'apps:is-available'
  },
  capture: {
    start: 'capture:start',
    stop: 'capture:stop',
    getStatus: 'capture:get-status',
    statusChanged: 'capture:status-changed'
  },
  theme: {
    getNative: 'theme:get-native',
    changed: 'theme:changed'
  },
  settings: {
    getAll: 'settings:get-all',
    set: 'settings:set',
    getStorageUsage: 'settings:get-storage-usage',
    openDirectoryDialog: 'settings:open-directory-dialog'
  },
  git: {
    getCommitsByDate: 'git:get-commits-by-date',
    getRepos: 'git:get-repos',
    scanRepos: 'git:scan-repos'
  },
  ocr: {
    search: 'ocr:search',
    getText: 'ocr:get-text'
  },
  ai: {
    generateSummary: 'ai:generate-summary',
    summaryChunk: 'ai:summary-chunk',
    summaryDone: 'ai:summary-done',
    summaryError: 'ai:summary-error'
  },
  app: {
    getVersion: 'app:get-version',
    openSettings: 'app:open-settings'
  },
  migration: {
    progress: 'migration:progress'
  }
} as const
