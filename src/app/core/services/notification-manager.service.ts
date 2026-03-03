import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NotificationItem {
  id: string;
  message: string;
  type: 'task-assigned' | 'task-submitted' | 'task-approved' | 'task-rejected' | 'info';
  read: boolean;
  createdAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationManagerService {
  private notificationsSubject = new BehaviorSubject<NotificationItem[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  constructor() {
    this.loadNotifications();
  }

  private loadNotifications(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('notifications');
        if (stored) {
          const notifications = JSON.parse(stored).map((n: any) => ({
            ...n,
            createdAt: new Date(n.createdAt)
          }));
          this.notificationsSubject.next(notifications);
        }
      } catch (error) {
      }
    }
  }

  private saveNotifications(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('notifications', JSON.stringify(this.notificationsSubject.value));
      } catch (error) {
      }
    }
  }

  addNotification(message: string, type: NotificationItem['type']): void {
    const newNotification: NotificationItem = {
      id: Date.now().toString(),
      message,
      type,
      read: false,
      createdAt: new Date()
    };
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([newNotification, ...current]);
    this.saveNotifications();
  }

  markAsRead(id: string): void {
    const current = this.notificationsSubject.value;
    const updated = current.map(n => n.id === id ? { ...n, read: true } : n);
    this.notificationsSubject.next(updated);
    this.saveNotifications();
  }

  markAllAsRead(): void {
    const current = this.notificationsSubject.value;
    const updated = current.map(n => ({ ...n, read: true }));
    this.notificationsSubject.next(updated);
    this.saveNotifications();
  }

  clearAll(): void {
    this.notificationsSubject.next([]);
    this.saveNotifications();
  }

  getUnreadCount(): number {
    return this.notificationsSubject.value.filter(n => !n.read).length;
  }

  // Notification events for task operations
  notifyTaskAssigned(employeeName: string, taskTitle: string): void {
    this.addNotification(`Task "${taskTitle}" assigned to ${employeeName}`, 'task-assigned');
  }

  notifyTaskSubmitted(employeeName: string, taskTitle: string): void {
    this.addNotification(`Task "${taskTitle}" submitted by ${employeeName}`, 'task-submitted');
  }

  notifyTaskApproved(taskTitle: string): void {
    this.addNotification(`Task "${taskTitle}" has been approved`, 'task-approved');
  }

  notifyTaskRejected(taskTitle: string, reason?: string): void {
    const msg = reason ? `Task "${taskTitle}" rejected: ${reason}` : `Task "${taskTitle}" has been rejected`;
    this.addNotification(msg, 'task-rejected');
  }
}

