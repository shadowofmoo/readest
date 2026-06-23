import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { navigateToLibrary } from '@/utils/nav';

export const useUserActions = () => {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigateToLibrary(router);
  };

  return {
    handleLogout,
    handleUpdateEmail: () => {},
    handleResetPassword: () => {},
    handleConfirmDelete: () => {},
  };
};
