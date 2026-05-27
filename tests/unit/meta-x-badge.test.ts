import { describe, it, expect } from 'vitest';
import {
  mockStorageGet,
  mockActionSetBadgeText,
  mockActionSetBadgeBackgroundColor,
} from '../setup/chrome-mock';
import { refreshMetaXBadge } from '../../lib/application/meta-x-badge';
import { getIsoWeekKey } from '../../lib/domain/meta-x-status';

const wed = new Date(2026, 4, 20);
const tue = new Date(2026, 4, 19);
const thu = new Date(2026, 4, 21);

describe('refreshMetaXBadge', () => {
  it('quarta + não respondida → badge "!" azul', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { metaXReminder: true }, metaXState: null });
    await refreshMetaXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(mockActionSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3b82f6' });
  });

  it('quarta + respondida → badge limpo', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoSettings: { metaXReminder: true },
      metaXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    await refreshMetaXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('terça → badge limpo (urgent só na quarta)', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { metaXReminder: true }, metaXState: null });
    await refreshMetaXBadge(tue);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('quinta → badge limpo', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { metaXReminder: true }, metaXState: null });
    await refreshMetaXBadge(thu);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('toggle OFF → badge limpo mesmo na quarta', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { metaXReminder: false }, metaXState: null });
    await refreshMetaXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockActionSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
