import { AvailablePlan } from '@/types/quota';

export const useAvailablePlans = () => {
  const availablePlans: AvailablePlan[] = [];
  const iapAvailable = false;

  return { availablePlans, iapAvailable, loading: false, error: null };
};
