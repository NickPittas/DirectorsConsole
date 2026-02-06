/**
 * Error Notification Component
 * 
 * Displays error messages to the user in a toast/notification style
 * Prevents silent failures by always showing errors
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import './ErrorNotification.css';

interface ErrorNotificationProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  onClose?: () => void;
  duration?: number;
}

export function ErrorNotification({ 
  message, 
  type = 'error', 
  onClose,
  duration = 5000 
}: ErrorNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (duration > 0) {
      const startTime = Date.now();
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(remaining);
        
        if (elapsed >= duration) {
          clearInterval(timer);
          setIsVisible(false);
          onClose?.();
        }
      }, 50);

      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]); // onClose intentionally omitted to prevent timer reset

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <div className={`error-notification ${type}`}>
      <div className="error-content">
        <span className="error-icon">
          {type === 'error' && '⚠️'}
          {type === 'warning' && '⚡'}
          {type === 'info' && 'ℹ️'}
        </span>
        <span className="error-message">{message}</span>
        <button className="error-close" onClick={handleClose}>✕</button>
      </div>
      <div className="error-progress">
        <div 
          className="error-progress-bar" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Error notification manager
interface Notification {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info';
}

let notificationCounter = 0;

// Debounce time in ms - prevent duplicate notifications within this window
const DEBOUNCE_MS = 1000;

// Module-level deduplication map: "type:message" -> timestamp
const recentMessages = new Map<string, number>();

function shouldShowNotification(type: string, message: string): boolean {
  const key = `${type}:${message}`;
  const now = Date.now();
  const lastShown = recentMessages.get(key);
  
  // Clean up old entries (older than 10 seconds)
  for (const [k, timestamp] of recentMessages.entries()) {
    if (now - timestamp > 10000) {
      recentMessages.delete(k);
    }
  }
  
  if (lastShown && (now - lastShown) < DEBOUNCE_MS) {
    return false; // Duplicate within debounce window
  }
  
  recentMessages.set(key, now);
  return true;
}

export function useErrorNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Use a ref to track which notifications have been scheduled for removal
  const removalTimersRef = useRef<Set<string>>(new Set());

  const showError = useCallback((message: string) => {
    if (!shouldShowNotification('error', message)) {
      return '';
    }
    
    notificationCounter += 1;
    const id = `${Date.now()}-${notificationCounter}`;
    
    setNotifications(prev => [...prev, { id, message, type: 'error' }]);
    return id;
  }, []);

  const showWarning = useCallback((message: string) => {
    if (!shouldShowNotification('warning', message)) {
      return '';
    }
    
    notificationCounter += 1;
    const id = `${Date.now()}-${notificationCounter}`;
    
    setNotifications(prev => [...prev, { id, message, type: 'warning' }]);
    return id;
  }, []);

  const showInfo = useCallback((message: string) => {
    if (!shouldShowNotification('info', message)) {
      return '';
    }
    
    notificationCounter += 1;
    const id = `${Date.now()}-${notificationCounter}`;
    
    setNotifications(prev => [...prev, { id, message, type: 'info' }]);
    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    removalTimersRef.current.delete(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return {
    showError,
    showWarning,
    showInfo,
    notifications,
    removeNotification,
  };
}

// Separate notification container component to prevent re-mounting on state changes
export function ErrorNotificationContainer({ 
  notifications, 
  onRemove 
}: { 
  notifications: Notification[]; 
  onRemove: (id: string) => void 
}) {
  return (
    <div className="error-notification-container">
      {notifications.map(notification => (
        <ErrorNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
}

export default ErrorNotification;
