import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationApiService, Notification as NotificationItem } from '../../core/services/notification-api.service';
// import { WebSocketService, SocketEvent } from '../../core/services/websocket.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.css']
})
export class NotificationComponent implements OnInit, OnDestroy {
  notifications: NotificationItem[] = [];
  showDropdown = false;
  selectedNotification: NotificationItem | null = null;
  unreadCount = 0;
  private destroy$ = new Subject<void>();
  private previousUnreadCount = 0;
  
  @ViewChild('notificationContainer', { static: false }) notificationContainer!: ElementRef;

  constructor(
    private notificationApiService: NotificationApiService,
    // private webSocketService: WebSocketService
  ) {}

  ngOnInit(): void {
    // Subscribe to notifications from the API service
    this.notificationApiService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications;
      });

    // Subscribe to unread count (just update the badge count)
    this.notificationApiService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.previousUnreadCount = this.unreadCount;
        this.unreadCount = count;
      });

    // Load initial notifications
    this.notificationApiService.loadNotifications();

    // WebSocket logic removed
  }

  /**
   * Handle WebSocket events and add real-time notifications
   */
  // WebSocket event handler removed

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.notificationContainer && !this.notificationContainer.nativeElement.contains(event.target)) {
      this.showDropdown = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectNotification(notif: NotificationItem): void {
    this.selectedNotification = notif;
    if (!notif.isRead) {
      // Mark as read immediately when viewing (optimistic update)
      const current = this.notifications;
      const index = current.findIndex(n => n.id === notif.id);
      if (index > -1) {
        current[index].isRead = true;
      }

      // Call API to persist
      this.notificationApiService.markAsRead(notif.id).subscribe(
        () => {
          // Already updated UI optimistically
        },
        error => {
          // Revert optimistic update on error
          if (index > -1) {
            current[index].isRead = false;
          }
        }
      );
    }
  }

  closeDetailView(): void {
    this.selectedNotification = null;
  }

  markAllAsRead(): void {
    // Optimistic update: mark all as read locally
    this.notifications.forEach(n => n.isRead = true);
    
    this.notificationApiService.markAllAsRead().subscribe(
      () => {
        this.notificationApiService.loadNotifications();
      },
      error => {
        // Revert on error will be handled by loadNotifications
        this.notificationApiService.loadNotifications();
      }
    );
  }

  clearAll(): void {
    // Optimistic update: clear all notifications immediately from UI
    this.notifications = [];
    this.showDropdown = false;
    this.selectedNotification = null;

    // Call API to persist the cleared state
    this.notificationApiService.clearAllNotifications().subscribe(
      () => {
        // State already updated optimistically
      },
      error => {
        // Reload to sync state on error
        this.notificationApiService.loadNotifications();
      }
    );
  }

  closeDropdown(): void {
    this.showDropdown = false;
    this.selectedNotification = null;
  }

  /**
   * Get user ID from local storage or auth service
   */
  private getUserId(): string | null {
    // This should be replaced with actual auth service call
    return localStorage.getItem('userId') || null;
  }

  getIconClass(type: string): string {
    const iconMap: { [key: string]: string } = {
      'task-assigned': 'bi bi-inbox text-info',
      'task-submitted': 'bi bi-check-circle text-warning',
      'task-approved': 'bi bi-check-circle-fill text-success',
      'task-rejected': 'bi bi-x-circle text-danger',
      'info': 'bi bi-info-circle text-primary'
    };
    return iconMap[type] || 'bi bi-bell';
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  getNotificationTitle(type: string): string {
    const titleMap: { [key: string]: string } = {
      'task-assigned': 'New Task Assigned',
      'task-submitted': 'Task Submitted',
      'task-approved': 'Task Approved',
      'task-rejected': 'Task Rejected',
      'info': 'Information'
    };
    return titleMap[type] || 'Notification';
  }

  getNotificationBadgeClass(type: string): string {
    const classMap: { [key: string]: string } = {
      'task-assigned': 'info',
      'task-submitted': 'warning',
      'task-approved': 'success',
      'task-rejected': 'danger',
      'info': 'primary'
    };
    return classMap[type] || 'secondary';
  }

  formatType(type: string): string {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  formatDate(date: Date): string {
    const dateObj = new Date(date);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    return dateObj.toLocaleDateString('en-US', options);
  }
}
