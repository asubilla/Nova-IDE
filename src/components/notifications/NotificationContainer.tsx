import React, { useEffect, useState } from 'react';
import { useNotificationStore, type Notification } from '../../store/notificationStore';

const TYPE_CONFIG: Record<Notification['type'], { icon: string; color: string; bg: string; border: string }> = {
  success: { icon: '\u2713', color: '#00e676', bg: '#00e67612', border: '#00e67640' },
  error: { icon: '\u2717', color: '#ff5252', bg: '#ff525212', border: '#ff525240' },
  warning: { icon: '\u26A0', color: '#ffd600', bg: '#ffd60012', border: '#ffd60040' },
  info: { icon: '\u2139', color: '#00d2ff', bg: '#00d2ff12', border: '#00d2ff40' },
  loading: { icon: '\u21BB', color: '#6c5ce7', bg: '#6c5ce712', border: '#6c5ce740' },
};

interface NotificationItemProps {
  notification: Notification;
}

function NotificationItem({ notification }: NotificationItemProps) {
  const { dismiss, markRead } = useNotificationStore();
  const config = TYPE_CONFIG[notification.type];
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => dismiss(notification.id), 300);
  };

  useEffect(() => {
    const timer = setTimeout(() => markRead(notification.id), 1000);
    return () => clearTimeout(timer);
  }, [notification.id, markRead]);

  return (
    <div
      className={`nova-notification nova-notification-${notification.type} ${exiting ? 'nova-notification-exit' : ''}`}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minWidth: 300,
        maxWidth: 420,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        animation: 'nova-notification-slide-in 0.3s ease-out',
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(120%)' : 'translateX(0)',
        cursor: 'default',
      }}
      onClick={() => notification.action?.onClick?.()}
    >
      <span
        style={{
          fontSize: 16,
          color: config.color,
          lineHeight: 1,
          marginTop: 1,
          flexShrink: 0,
        }}
        className={notification.type === 'loading' ? 'nova-notification-spin' : ''}
      >
        {config.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: config.color,
            lineHeight: 1.3,
          }}
        >
          {notification.title}
        </div>
        {notification.message && (
          <div
            style={{
              fontSize: 12,
              color: '#999',
              marginTop: 2,
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {notification.message}
          </div>
        )}
        {notification.action && (
          <button
            className="nova-notification-action"
            style={{
              marginTop: 6,
              fontSize: 12,
              color: config.color,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={(e) => {
              e.stopPropagation();
              notification.action!.onClick();
            }}
          >
            {notification.action.label}
          </button>
        )}
      </div>
      {notification.dismissible && (
        <button
          className="nova-notification-close"
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            fontSize: 14,
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
        >
          x
        </button>
      )}
    </div>
  );
}

export function NotificationContainer() {
  const notifications = useNotificationStore((s) => s.notifications);
  const maxVisible = useNotificationStore((s) => s.maxVisible);
  const visible = notifications.slice(0, maxVisible);

  return (
    <div
      className="nova-notification-container"
      style={{
        position: 'fixed',
        top: 48,
        right: 16,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        {visible.map((n) => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </div>
    </div>
  );
}
