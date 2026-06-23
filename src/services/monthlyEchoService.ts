import { api } from './apiClient';
import type { MonthlyEchoPayload } from '../utils/monthlyEcho';

export const monthlyEchoService = {
  async loadMonthlyEcho(monthKey: string): Promise<MonthlyEchoPayload> {
    return api.get<MonthlyEchoPayload>(`/monthly-echo?monthKey=${encodeURIComponent(monthKey)}`);
  },

  async regenerateMonthlyEcho(monthKey: string): Promise<MonthlyEchoPayload> {
    return api.post<MonthlyEchoPayload>(`/monthly-echo/${encodeURIComponent(monthKey)}/regenerate`);
  },
};

