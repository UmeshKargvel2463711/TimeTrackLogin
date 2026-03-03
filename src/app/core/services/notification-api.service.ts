import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface Notification {
  id: string;
  userId: string;
  type: 'task-assigned' | 'task-submitted' | 'task-approved' | 'task-rejected' | 'info';
  message: string;
  isRead: boolean;
  isCleared: boolean;
  createdAt: Date;
}

export interface CreateNotificationDto {
  userId: string;
  type: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationApiService {
  private readonly apiUrl = 'https://localhost:7172/api/Notification'; // Update with your backend URL
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initializeNotifications();
  }

  private initializeNotifications(): void {
    this.loadNotifications();
    // Removed auto-polling - notifications only load on demand
  }

  /**
   * Load all notifications for current user
   */
  loadNotifications(): void {
    this.getMyNotifications().subscribe();
  }

  /**
   * Get all notifications for current user (excluding cleared ones)
   */
  private getMyNotifications(): Observable<Notification[]> {
    return this.http.get<{ success: boolean; data: Notification[] }>(
      `${this.apiUrl}`
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          const notifications = response.data
            .filter(n => !n.isCleared) // Exclude cleared notifications
            .map(n => ({
              ...n,
              createdAt: new Date(n.createdAt)
            }));
          this.notificationsSubject.next(notifications);
          this.updateUnreadCount();
        }
      }),
      switchMap(response => of(response.data || [])),
      catchError(error => {
        return of([]);
      })
    );
  }

  /**
   * Get only unread notifications
   */
  getUnreadNotifications(): Observable<Notification[]> {
    return this.http.get<{ success: boolean; data: Notification[] }>(
      `${this.apiUrl}/unread`
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.updateUnreadCount();
        }
      }),
      switchMap(response => of(response.data || [])),
      catchError(error => {
        return of([]);
      })
    );
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): Observable<number> {
    return this.http.get<{ success: boolean; data: number }>(
      `${this.apiUrl}/unread/count`
    ).pipe(
      tap(response => {
        if (response.success) {
          this.unreadCountSubject.next(response.data);
        }
      }),
      switchMap(response => of(response.data || 0)),
      catchError(error => {
        return of(0);
      })
    );
  }

  /**
   * Create a new notification
   */
  createNotification(dto: CreateNotificationDto): Observable<boolean> {
    return this.http.post<{ success: boolean; data: boolean }>(
      `${this.apiUrl}`,
      dto
    ).pipe(
      tap(response => {
        if (response.success) {
          this.loadNotifications();
        }
      }),
      switchMap(response => of(response.data || false)),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Mark a specific notification as read
   */
  markAsRead(notificationId: string): Observable<boolean> {
    return this.http.patch<{ success: boolean; data: boolean }>(
      `${this.apiUrl}/${notificationId}/read`,
      {}
    ).pipe(
      tap(response => {
        if (response.success) {
          this.loadNotifications();
        }
      }),
      switchMap(response => of(response.data || false)),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): Observable<boolean> {
    return this.http.patch<{ success: boolean; data: boolean }>(
      `${this.apiUrl}/read-all`,
      {}
    ).pipe(
      tap(response => {
        if (response.success) {
          this.loadNotifications();
        }
      }),
      switchMap(response => of(response.data || false)),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Delete a specific notification
   */
  deleteNotification(notificationId: string): Observable<boolean> {
    return this.http.delete<{ success: boolean; data: boolean }>(
      `${this.apiUrl}/${notificationId}`
    ).pipe(
      tap(response => {
        if (response.success) {
          this.loadNotifications();
        }
      }),
      switchMap(response => of(response.data || false)),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Mark all notifications as cleared (not deleted, just hidden from view)
   */
  clearAllNotifications(): Observable<boolean> {
    return this.http.patch<{ success: boolean; data: boolean }>(
      `${this.apiUrl}/clear-all`,
      {}
    ).pipe(
      tap(response => {
        if (response.success) {
          // Immediately clear local state (all notifications marked as cleared)
          this.notificationsSubject.next([]);
          this.updateUnreadCount();
        }
      }),
      switchMap(response => of(response.data || false)),
      catchError(error => {
        return of(false);
      })
    );
  }

  /**
   * Update unread count internally
   */
  private updateUnreadCount(): void {
    const current = this.notificationsSubject.value;
    const unreadCount = current.filter(n => !n.isRead).length;
    this.unreadCountSubject.next(unreadCount);
  }

  /**
   * Add a new notification received via WebSocket (real-time)
   * This ensures new notifications appear even after "Clear All"
   */
  public addRealtimeNotification(notification: Notification): void {
    const formattedNotification = {
      ...notification,
      createdAt: new Date(notification.createdAt),
      isCleared: false // Ensure new notifications are not marked as cleared
    };

    const current = this.notificationsSubject.value;
    // Check if notification already exists to avoid duplicates
    const exists = current.some(n => n.id === formattedNotification.id);
    
    if (!exists) {
      const updated = [formattedNotification, ...current];
      this.notificationsSubject.next(updated);
      this.updateUnreadCount();
    }
  }

  /**
   * Get current notifications (without fetching from server)
   */
  public getCurrentNotifications(): Notification[] {
    return this.notificationsSubject.value;
  }
}
