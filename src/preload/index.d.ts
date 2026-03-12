import type { ElectronAPI } from '../types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
