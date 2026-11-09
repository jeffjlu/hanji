import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, login, logout, register } from '@/lib/api/client';
import { ApiError } from '../api/errors';

export const currentUserQueryKey = ['currentUser'] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: async () => {
      try {
        return await getMe();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }

        throw error;
      }
    },
    retry: 3,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (response) => {
      queryClient.setQueryData(currentUserQueryKey, response);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (response) => {
      queryClient.setQueryData(currentUserQueryKey, response);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
