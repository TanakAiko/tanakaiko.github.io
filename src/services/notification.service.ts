import { Injectable, signal, computed } from '@angular/core';

// ============================================================================
// INTERFACES
// ============================================================================

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  persistent?: boolean; // If true, won't auto-dismiss
  duration?: number;    // Duration in milliseconds
}

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  private readonly _notifications = signal<Notification[]>([]);
  
  /** All active notifications */
  readonly notifications = this._notifications.asReadonly();
  
  /** Check if there are any notifications */
  readonly hasNotifications = computed(() => this._notifications().length > 0);

  // Default durations by type
  private readonly DEFAULT_DURATIONS: Record<NotificationType, number> = {
    success: 3000,
    error: 5000,
    warning: 4000,
    info: 3000,
  };

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Show a success toast notification
   */
  success(message: string, title?: string): void {
    this.show({ type: 'success', message, title });
  }

  /**
   * Show an error toast notification
   */
  error(message: string, title?: string, persistent = false): void {
    this.show({ type: 'error', message, title, persistent });
  }

  /**
   * Show a warning toast notification
   */
  warning(message: string, title?: string): void {
    this.show({ type: 'warning', message, title });
  }

  /**
   * Show an info toast notification
   */
  info(message: string, title?: string): void {
    this.show({ type: 'info', message, title });
  }

  /**
   * Show a custom notification
   */
  show(notification: Omit<Notification, 'id'>): void {
    const id = this.generateId();
    const duration = notification.duration ?? this.DEFAULT_DURATIONS[notification.type];
    
    const newNotification: Notification = {
      ...notification,
      id,
      duration,
    };

    this._notifications.update(notifications => [...notifications, newNotification]);

    // Auto-dismiss if not persistent
    if (!notification.persistent) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  /**
   * Dismiss a specific notification
   */
  dismiss(id: string): void {
    this._notifications.update(notifications => 
      notifications.filter(n => n.id !== id)
    );
  }

  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    this._notifications.set([]);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `notification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
