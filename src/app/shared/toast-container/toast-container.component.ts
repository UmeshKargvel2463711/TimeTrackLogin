import { Component, computed, inject } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [NgFor, NgClass],
  templateUrl: './toast-container.component.html',
  styleUrls: ['./toast-container.component.css']
})
export class ToastContainerComponent {
  private svc = inject(NotificationService);
  toasts = computed(() => this.svc.toastNotifications());

  close(id: string) {
    // Optional exit animation: add .closing before removal for smooth fade-out
    const el = document.querySelector(`[data-toast-id="${id}"]`);
    if (el) {
      el.classList.add('closing');
      setTimeout(() => this.svc.removeToast(id), 160);
    } else {
      this.svc.removeToast(id);
    }
  }

  icon(type: string) {
    return ({ success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' })[type] ?? '🔔';
  }
}