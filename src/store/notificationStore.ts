import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playNotificationSound } from '../utils/notificationSound';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  maxVisible: number;
  add: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string;
  success: (title: string, message?: string, opts?: Partial<Notification>) => string;
  error: (title: string, message?: string, opts?: Partial<Notification>) => string;
  warning: (title: string, message?: string, opts?: Partial<Notification>) => string;
  info: (title: string, message?: string, opts?: Partial<Notification>) => string;
  loading: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  markRead: (id: string) => void;
  update: (id: string, updates: Partial<Pick<Notification, 'type' | 'title' | 'message'>>) => void;
  clear: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      maxVisible: 5,

      add: (n) => {
        const id = crypto.randomUUID();
        const notification: Notification = {
          ...n,
          id,
          timestamp: Date.now(),
          read: false,
          dismissible: n.dismissible ?? true,
          duration: n.duration ?? (n.type === 'error' ? 8000 : n.type === 'loading' ? 0 : 4000),
        };

        set((s) => ({
          notifications: [notification, ...s.notifications].slice(0, 100),
        }));

        if (notification.type !== 'loading') {
          playNotificationSound(notification.type);
        }

        if (notification.duration && notification.duration > 0) {
          setTimeout(() => get().dismiss(id), notification.duration);
        }

        return id;
      },

      success: (title, message = '', opts) =>
        get().add({ type: 'success', title, message, ...opts }),

      error: (title, message = '', opts) =>
        get().add({ type: 'error', title, message, duration: 8000, ...opts }),

      warning: (title, message = '', opts) =>
        get().add({ type: 'warning', title, message, duration: 6000, ...opts }),

      info: (title, message = '', opts) =>
        get().add({ type: 'info', title, message, ...opts }),

      loading: (title, message = '') =>
        get().add({ type: 'loading', title, message, duration: 0, dismissible: false }),

      dismiss: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),

      dismissAll: () => set({ notifications: [] }),

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      update: (id, updates) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, ...updates } : n
          ),
        })),

      clear: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    {
      name: 'nova-notifications',
      partialize: (state) => ({
        notifications: state.notifications.filter(
          (n) => n.type === 'error' || n.type === 'warning'
        ),
      }),
    }
  )
);
