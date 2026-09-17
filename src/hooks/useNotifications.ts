import { useCallback } from 'react';
import { useNotificationStore, type Notification } from '../store/notificationStore';

export function useNotifications() {
  const store = useNotificationStore();

  const notify = useCallback(
    (type: Notification['type'], title: string, message?: string, opts?: Partial<Notification>) => {
      return store.add({ type, title, message: message || '', ...opts });
    },
    [store]
  );

  const notifySuccess = useCallback(
    (title: string, message?: string) => store.success(title, message),
    [store]
  );

  const notifyError = useCallback(
    (title: string, message?: string, action?: Notification['action']) =>
      store.error(title, message, action ? { action } : undefined),
    [store]
  );

  const notifyWarning = useCallback(
    (title: string, message?: string) => store.warning(title, message),
    [store]
  );

  const notifyInfo = useCallback(
    (title: string, message?: string) => store.info(title, message),
    [store]
  );

  const notifyLoading = useCallback(
    (title: string, message?: string) => store.loading(title, message),
    [store]
  );

  const dismissById = useCallback(
    (id: string) => store.dismiss(id),
    [store]
  );

  const dismissAll = useCallback(
    () => store.dismissAll(),
    [store]
  );

  return {
    notify,
    success: notifySuccess,
    error: notifyError,
    warning: notifyWarning,
    info: notifyInfo,
    loading: notifyLoading,
    dismiss: dismissById,
    dismissAll,
    update: store.update,
    notifications: store.notifications,
    unreadCount: store.unreadCount(),
  };
}
