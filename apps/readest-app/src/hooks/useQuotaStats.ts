import { QuotaType, UserPlan } from '@/types/quota';

export const useQuotaStats = () => {
  const quotas: QuotaType[] = [];
  const userProfilePlan: UserPlan = 'free';

  return { quotas, userProfilePlan };
};
