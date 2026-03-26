/**
 * Global Chrome Extension API mock for Vitest unit tests.
 * Sets up globalThis.chrome before every test and resets it to defaults after.
 *
 * Import the exported mock functions in test files to assert on calls or
 * override the default resolved values.
 */
import { vi, beforeEach } from 'vitest'

// ── Storage ──────────────────────────────────────────────────────────────────
export const mockStorageGet = vi.fn().mockResolvedValue({})
export const mockStorageSet = vi.fn().mockResolvedValue(undefined)
export const mockStorageRemove = vi.fn().mockResolvedValue(undefined)

type StorageListener = (changes: Record<string, unknown>, area: string) => void
const _storageListeners: StorageListener[] = []

export function triggerStorageChange(changes: Record<string, unknown>, area = 'local'): void {
  _storageListeners.forEach(fn => fn(changes, area))
}

// ── Cookies ───────────────────────────────────────────────────────────────────
export const mockCookiesGetAll = vi.fn().mockResolvedValue([])

// ── Scripting ─────────────────────────────────────────────────────────────────
export const mockScriptingExecuteScript = vi.fn().mockResolvedValue([{ result: null }])

// ── Tabs ──────────────────────────────────────────────────────────────────────
export const mockTabsQuery = vi.fn().mockResolvedValue([])
export const mockTabsCreate = vi.fn().mockResolvedValue({ id: 99 })
export const mockTabsRemove = vi.fn().mockResolvedValue(undefined)
export const mockTabsSendMessage = vi.fn().mockResolvedValue(undefined)

// ── Windows ───────────────────────────────────────────────────────────────────
export const mockWindowsGetCurrent = vi
  .fn()
  .mockResolvedValue({ left: 0, top: 0, width: 1920, height: 1080 })
export const mockWindowsGet = vi.fn().mockResolvedValue({ id: 42 })
export const mockWindowsCreate = vi.fn().mockResolvedValue({ id: 42 })
export const mockWindowsRemove = vi.fn().mockResolvedValue(undefined)

// ── Runtime ───────────────────────────────────────────────────────────────────
export const mockRuntimeSendMessage = vi.fn().mockResolvedValue(undefined)
export const mockRuntimeGetURL = vi.fn((path: string) => `chrome-extension://test-id/${path}`)

// ── Alarms ────────────────────────────────────────────────────────────────────
export const mockAlarmsCreate = vi.fn()
export const mockAlarmsClear = vi.fn().mockResolvedValue(true)

// ── Chrome global object ──────────────────────────────────────────────────────
const chromeMock = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
    },
    onChanged: {
      addListener: vi.fn((fn: StorageListener) => _storageListeners.push(fn)),
      removeListener: vi.fn((fn: StorageListener) => {
        const i = _storageListeners.indexOf(fn)
        if (i >= 0) _storageListeners.splice(i, 1)
      }),
    },
  },
  cookies: {
    getAll: mockCookiesGetAll,
  },
  scripting: {
    executeScript: mockScriptingExecuteScript,
  },
  tabs: {
    query: mockTabsQuery,
    create: mockTabsCreate,
    remove: mockTabsRemove,
    sendMessage: mockTabsSendMessage,
  },
  windows: {
    getCurrent: mockWindowsGetCurrent,
    get: mockWindowsGet,
    create: mockWindowsCreate,
    remove: mockWindowsRemove,
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: mockRuntimeSendMessage,
    getURL: mockRuntimeGetURL,
  },
  alarms: {
    create: mockAlarmsCreate,
    clear: mockAlarmsClear,
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
}

// Expose chrome globally once
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
})

// Reset call history and restore default implementations before each test
beforeEach(() => {
  vi.clearAllMocks()

  mockStorageGet.mockResolvedValue({})
  mockStorageSet.mockResolvedValue(undefined)
  mockStorageRemove.mockResolvedValue(undefined)
  mockCookiesGetAll.mockResolvedValue([])
  mockScriptingExecuteScript.mockResolvedValue([{ result: null }])
  mockTabsQuery.mockResolvedValue([])
  mockTabsCreate.mockResolvedValue({ id: 99 })
  mockTabsRemove.mockResolvedValue(undefined)
  mockTabsSendMessage.mockResolvedValue(undefined)
  mockWindowsGetCurrent.mockResolvedValue({ left: 0, top: 0, width: 1920, height: 1080 })
  mockWindowsGet.mockResolvedValue({ id: 42 })
  mockWindowsCreate.mockResolvedValue({ id: 42 })
  mockWindowsRemove.mockResolvedValue(undefined)
  mockRuntimeSendMessage.mockResolvedValue(undefined)
  mockRuntimeGetURL.mockImplementation((path: string) => `chrome-extension://test-id/${path}`)
  mockAlarmsClear.mockResolvedValue(true)

  // Drain storage listeners accumulated by previous tests
  _storageListeners.length = 0

  // Re-wire listeners mock so new tests can track them
  ;(chromeMock.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
    (fn: StorageListener) => _storageListeners.push(fn),
  )
  ;(chromeMock.storage.onChanged.removeListener as ReturnType<typeof vi.fn>).mockImplementation(
    (fn: StorageListener) => {
      const i = _storageListeners.indexOf(fn)
      if (i >= 0) _storageListeners.splice(i, 1)
    },
  )
})
