import { UserPlan } from '@/types/quota';

const LOCAL_USER_ID = 'local-user';

export const getSubscriptionPlan = (_token?: string): UserPlan => 'free';

export const getUserProfilePlan = (_token?: string): UserPlan => 'free';

export const EMAIL_IN_PLANS: readonly UserPlan[] = [];

export const isEmailInPlan = (_plan?: UserPlan): boolean => false;

export const STORAGE_QUOTA_GRACE_BYTES = 0;

export const getStoragePlanData = (_token?: string) => ({
  plan: 'free' as UserPlan,
  usage: 0,
  quota: 10 * 1024 * 1024 * 1024,
});

export const getTranslationQuota = (_plan?: UserPlan): number => 100000;

export const getTranslationPlanData = (_token?: string) => ({
  plan: 'free' as UserPlan,
  usage: 0,
  quota: 100000,
});

export const getDailyTranslationPlanData = (_token?: string) => ({
  plan: 'free' as UserPlan,
  quota: 100000,
});

export const getAccessToken = async (): Promise<string | null> => 'local-token';

export const getUserID = async (): Promise<string | null> => LOCAL_USER_ID;

export const validateUserAndToken = async () => ({
  user: { id: LOCAL_USER_ID },
  token: 'local-token',
});
