import { describe, it, expect } from 'vitest';
import {
  mockStorageGet,
  mockActionSetBadgeText,
  mockActionSetBadgeBackgroundColor,
} from '../setup/chrome-mock';
import { refreshInsiXBadge } from '../../lib/application/insi-x-badge';
import { getIsoWeekKey } from '../../lib/domain/insi-x-status';

const wed = new Date(2026, 4, 20);
const tue = new Date(2026, 4, 19);
const thu = new Date(2026, 4, 21);

describe('refreshInsiXBadge', () => {
  it('quarta + não respondida → badge "!" rosa', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { insiXReminder: true }, insiXState: null });
    await refreshInsiXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(mockActionSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ca2d7e' });
  });

  it('quarta + respondida → badge limpo', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoSettings: { insiXReminder: true },
      insiXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    await refreshInsiXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('terça → badge limpo (urgent só na quarta)', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { insiXReminder: true }, insiXState: null });
    await refreshInsiXBadge(tue);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('quinta → badge limpo', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { insiXReminder: true }, insiXState: null });
    await refreshInsiXBadge(thu);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('toggle OFF → badge limpo mesmo na quarta', async () => {
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { insiXReminder: false }, insiXState: null });
    await refreshInsiXBadge(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockActionSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
