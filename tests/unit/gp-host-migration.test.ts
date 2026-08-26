import { describe, it, expect } from 'vitest'
import {
  isVersionBefore,
  markGpHostMigrationOnUpdate,
  resolveGpHostMigration,
  requestGpHostPermission,
  PENDING_GP_HOST_MIGRATION_KEY,
  GP_HOST_ORIGIN_PATTERN,
} from '../../lib/application/gp-host-migration'
import {
  mockStorageGet, mockStorageSet, mockStorageRemove,
  mockPermissionsContains, mockPermissionsRequest, mockRuntimeSendMessage,
} from '../setup/chrome-mock'

describe('isVersionBefore', () => {
  it('compara semver numericamente', () => {
    expect(isVersionBefore('0.14.0', '0.15.0')).toBe(true)
    expect(isVersionBefore('0.9.9', '0.15.0')).toBe(true)
    expect(isVersionBefore('0.15.0', '0.15.0')).toBe(false)
    expect(isVersionBefore('0.15.1', '0.15.0')).toBe(false)
    expect(isVersionBefore('1.0.0', '0.15.0')).toBe(false)
  })
  it('versão desconhecida conta como antiga', () => {
    expect(isVersionBefore(undefined, '0.15.0')).toBe(true)
  })
})

describe('markGpHostMigrationOnUpdate', () => {
  it('update vindo de < 0.15.0 marca pendente e descarta caches do host antigo', async () => {
    await markGpHostMigrationOnUpdate({ reason: 'update', previousVersion: '0.14.0' })
    expect(mockStorageSet).toHaveBeenCalledWith({ [PENDING_GP_HOST_MIGRATION_KEY]: true })
    expect(mockStorageRemove).toHaveBeenCalledWith(['gpAssertion', 'gpAssertionTs', 'gpUnreachableTs', 'gpUnreachableUrl'])
  })
  it('install limpo e chrome_update não fazem nada', async () => {
    await markGpHostMigrationOnUpdate({ reason: 'install' })
    await markGpHostMigrationOnUpdate({ reason: 'chrome_update', previousVersion: '0.14.0' })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
  it('update entre versões já migradas não remarca', async () => {
    await markGpHostMigrationOnUpdate({ reason: 'update', previousVersion: '0.15.0' })
    expect(mockStorageSet).not.toHaveBeenCalled()
  })
})

describe('resolveGpHostMigration (abertura do popup)', () => {
  it("sem flag → 'none' sem consultar permissões", async () => {
    mockStorageGet.mockResolvedValue({})
    expect(await resolveGpHostMigration()).toBe('none')
    expect(mockPermissionsContains).not.toHaveBeenCalled()
  })
  it('flag + permissão já concedida → resolve em silêncio e força sync', async () => {
    mockStorageGet.mockResolvedValue({ [PENDING_GP_HOST_MIGRATION_KEY]: true })
    mockPermissionsContains.mockResolvedValue(true)
    expect(await resolveGpHostMigration()).toBe('none')
    expect(mockPermissionsContains).toHaveBeenCalledWith({ origins: [GP_HOST_ORIGIN_PATTERN] })
    expect(mockStorageRemove).toHaveBeenCalledWith(expect.arrayContaining([PENDING_GP_HOST_MIGRATION_KEY, 'gpAssertion']))
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'FORCE_REDETECT' })
  })
  it("flag + sem permissão → 'pending' (banner)", async () => {
    mockStorageGet.mockResolvedValue({ [PENDING_GP_HOST_MIGRATION_KEY]: true })
    mockPermissionsContains.mockResolvedValue(false)
    expect(await resolveGpHostMigration()).toBe('pending')
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })
})

describe('requestGpHostPermission (clique em Ativar)', () => {
  it('concedida → limpa flag/caches e força sync', async () => {
    mockPermissionsRequest.mockResolvedValue(true)
    expect(await requestGpHostPermission()).toBe(true)
    expect(mockPermissionsRequest).toHaveBeenCalledWith({ origins: [GP_HOST_ORIGIN_PATTERN] })
    expect(mockStorageRemove).toHaveBeenCalledWith(expect.arrayContaining([PENDING_GP_HOST_MIGRATION_KEY]))
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'FORCE_REDETECT' })
  })
  it('negada → mantém pendente, sem sync', async () => {
    mockPermissionsRequest.mockResolvedValue(false)
    expect(await requestGpHostPermission()).toBe(false)
    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(mockRuntimeSendMessage).not.toHaveBeenCalled()
  })
  it('API lançando (contexto sem gesto) → false, sem quebrar', async () => {
    mockPermissionsRequest.mockRejectedValue(new Error('This function must be called during a user gesture'))
    expect(await requestGpHostPermission()).toBe(false)
  })
})
