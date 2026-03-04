import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RegistrationService, PendingRegistration } from '../../../core/services/registration.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-approve-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './approve-registrations.component.html',
  styleUrls: ['./approve-registrations.component.css']
})
export class ApproveRegistrationsComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private registrationService = inject(RegistrationService);
  private notificationService = inject(NotificationService);
  private userService = inject(UserService);

  allRegistrations: PendingRegistration[] = [];
  activeTab: 'pending' | 'approved' | 'rejected' = 'pending';
  isLoading = false;
  errorMessage = '';

  // Reject modal
  showRejectModal = false;
  selectedRegistration: PendingRegistration | null = null;
  rejectionReason = '';

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadAllRegistrations();
    }
  }

  loadAllRegistrations() {
    this.isLoading = true;
    this.errorMessage = '';

    this.registrationService.getAllRegistrations().subscribe({
      next: (registrations: PendingRegistration[]) => {
        this.isLoading = false;
        this.allRegistrations = registrations;
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = 'Failed to load registrations.';
      }
    });
  }

  get filteredRegistrations(): PendingRegistration[] {
    return this.allRegistrations.filter(r =>
      r.status?.toLowerCase() === this.activeTab
    );
  }

  getPendingCount(): number {
    return this.allRegistrations.filter(r => r.status?.toLowerCase() === 'pending').length;
  }

  getApprovedCount(): number {
    return this.allRegistrations.filter(r => r.status?.toLowerCase() === 'approved').length;
  }

  getRejectedCount(): number {
    return this.allRegistrations.filter(r => r.status?.toLowerCase() === 'rejected').length;
  }

  setActiveTab(tab: 'pending' | 'approved' | 'rejected') {
    this.activeTab = tab;
  }

 approveRegistration(registration: PendingRegistration) {
  // Show a non-blocking info toast instead of window.confirm
 

  this.registrationService.approveRegistration(registration.registrationId).subscribe({
    next: () => {
      this.notificationService.success(`${registration.name} approved successfully!`);
      this.loadAllRegistrations();

      // Let backend finish creating the user before refresh
      setTimeout(() => {
        this.userService.refreshUsers();
      }, 500);
    },
    error: (err: any) => {
      this.notificationService.error(err.error?.message || 'Failed to approve');
    }
  });
}

  openRejectModal(registration: PendingRegistration) {
    this.selectedRegistration = registration;
    this.rejectionReason = '';
    this.showRejectModal = true;
  }

  closeRejectModal() {
    this.showRejectModal = false;
    this.selectedRegistration = null;
    this.rejectionReason = '';
  }

  confirmReject() {
    if (!this.selectedRegistration) return;

    this.registrationService.rejectRegistration(
      this.selectedRegistration.registrationId,
      this.rejectionReason
    ).subscribe({
      next: () => {
        this.notificationService.success(`${this.selectedRegistration?.name} rejected.`);
        this.closeRejectModal();
        this.loadAllRegistrations();
      },
      error: (err: any) => {
        this.notificationService.error(err.error?.message || 'Failed to reject');
      }
    });
  }

  deleteRegistration(registration: PendingRegistration) {
  // Optional: show a brief “in progress” toast
 

  this.registrationService.deleteRegistration(registration.registrationId).subscribe({
    next: () => {
      this.notificationService.success('Deleted successfully');
      this.loadAllRegistrations();
    },
    error: () => {
      this.notificationService.error('Failed to delete');
    }
  });
}

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}
