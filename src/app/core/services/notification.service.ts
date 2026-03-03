import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer, of } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import type { Notification } from '../models/notification.model';
 
// Toast notification interface
export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  duration?: number;
}
 
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
 
  // API URL - uses proxy to backend
  private apiUrl = '/api/Notification';
 
  // ========= Persistent notifications (backend) =========
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();
 
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();
 
  // ========= Toast notifications (UI-only) =========
  toastNotifications = signal<ToastNotification[]>([]);
  private toastIdCounter = 0;
 
  // (Optional) simple de-duplication window to avoid double toasts on fast clicks
  private recentMessages = new Map<string, number>();
  private readonly DEDUPE_MS = 1200;
 
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.startPolling();
    }
  }
 
  // ==================== TOAST NOTIFICATION METHODS (UI Feedback) ====================
 
  /** Show a success toast */
  success(message: string, duration: number = 3000): void {
    this.addToast('success', message, duration);
  }
 
  /** Show an error toast */
  error(message: string, duration: number = 4000): void {
    this.addToast('error', message, duration);
  }
 
  /** Show a warning toast */
  warning(message: string, duration: number = 4000): void {
    this.addToast('warning', message, duration);
  }
 
  /** Show an info toast */
  info(message: string, duration: number = 3000): void {
    this.addToast('info', message, duration);
  }
 
  private addToast(
    type: 'success' | 'error' | 'warning' | 'info',
    message: string,
    duration: number
  ): void {
    // De-dupe same message fired within DEDUPE_MS
    const now = Date.now();
    const last = this.recentMessages.get(message) ?? 0;
    if (now - last < this.DEDUPE_MS) return;
    this.recentMessages.set(message, now);
    setTimeout(() => this.recentMessages.delete(message), this.DEDUPE_MS);
 
    const toast: ToastNotification = {
      id: `toast_${this.toastIdCounter++}`,
      type,
      message,
      timestamp: new Date(),
      duration
    };
 
    const current = this.toastNotifications();
    // Prepend to show newest on top
    this.toastNotifications.set([toast, ...current]);
 
    if (duration > 0) {
      setTimeout(() => this.removeToast(toast.id), duration);
    }
  }
 
  removeToast(id: string): void {
    const current = this.toastNotifications();
    this.toastNotifications.set(current.filter(t => t.id !== id));
  }
 
  clearAllToasts(): void {
    this.toastNotifications.set([]);
  }
 
  // ==================== BACKEND API METHODS (Persistent Notifications) ====================
 
  /** Get all notifications for current user */
  getUserNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.apiUrl}`)
      .pipe(
        tap(notifications => this.notificationsSubject.next(notifications || [])),
        catchError(error => {
          console.error('Error fetching notifications:', error);
          return of([]);
        })
      );
  }
 
  /** Get only unread notifications */
  getUnreadNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.apiUrl}/unread`)
      .pipe(
        tap(notifications => {
          this.notificationsSubject.next(notifications || []);
          this.unreadCountSubject.next(notifications?.length || 0);
        }),
        catchError(error => {
          console.error('Error fetching unread notifications:', error);
          return of([]);
        })
      );
  }
 
  /** Get unread count (for badge) */
  getUnreadCount(): Observable<number> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/unread/count`)
      .pipe(
        map(response => response?.count || 0),
        tap(count => this.unreadCountSubject.next(count)),
        catchError(error => {
          console.error('Error fetching unread count:', error);
          return of(0);
        })
      );
  }
 
  /** Mark a notification as read */
  markAsRead(notificationId: number): Observable<boolean> {
    return this.http.patch<any>(`${this.apiUrl}/${notificationId}/read`, {})
      .pipe(
        map(() => true),
        tap(() => this.refreshNotifications()),
        catchError(error => {
          console.error('Error marking notification as read:', error);
          return of(false);
        })
      );
  }
 
  /** Mark all notifications as read */
  markAllAsRead(): Observable<boolean> {
    return this.http.patch<any>(`${this.apiUrl}/read-all`, {})
      .pipe(
        map(() => true),
        tap(() => this.refreshNotifications()),
        catchError(error => {
          console.error('Error marking all as read:', error);
          return of(false);
        })
      );
  }
 
  /** Refresh notifications and count */
  refreshNotifications(): void {
    this.getUnreadCount().subscribe();
    this.getUnreadNotifications().subscribe();
  }
 
  /** Poll for new notifications every 30 seconds */
  private startPolling(): void {
    timer(0, 30000)
      .pipe(
        switchMap(() => this.getUnreadCount()),
        catchError(() => of(0))
      )
      .subscribe();
  }
 
  /** Get notification icon based on type (for persistent/bell UI) */
  getNotificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'LogReminder': '⏰',
      'TaskDeadline': '⚠️',
      'TaskAssigned': '📋',
      'TaskCompleted': '✅',
      'TaskSubmitted': '📤',
      'TaskApproved': '✅',
      'TaskRejected': '❌',
      'TaskStarted': '▶️',
      'NewUserRegistered': '👤'
    };
    return icons[type] || '🔔';
  }
 
  /** Get notification color based on type (for persistent/bell UI) */
  getNotificationColor(type: string): string {
    const colors: { [key: string]: string } = {
      'LogReminder': 'info',
      'TaskDeadline': 'warning',
      'TaskAssigned': 'primary',
      'TaskCompleted': 'success',
      'TaskSubmitted': 'info',
      'TaskApproved': 'success',
      'TaskRejected': 'danger',
      'TaskStarted': 'info',
      'NewUserRegistered': 'warning'
    };
    return colors[type] || 'secondary';
  }
}
 