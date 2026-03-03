import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TimeLogService } from '../../core/services/time-log.service';
import { ProfileModalComponent } from '../../shared/profile-modal/profile-modal.component';
import { NotificationComponent } from '../../shared/notification/notification.component';

@Component({
  selector: 'app-employee',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ProfileModalComponent, NotificationComponent],
  templateUrl: './employee.component.html',
  styleUrl: './employee.component.css'
})
export class EmployeeComponent implements OnInit {
  @ViewChild(ProfileModalComponent) profileModal!: ProfileModalComponent;

  private router = inject(Router);
  private authService = inject(AuthService);
  private timeLogService = inject(TimeLogService);

  employeeName: string = 'Employee';
  userRole: string = 'Employee';
  profileInitial: string = 'E';
  showDropdown: boolean = false;

  ngOnInit() {
    // Get current user from AuthService
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      // Use fullName directly
      const fullName = currentUser.fullName || 'Employee';

      this.employeeName = fullName;
      this.userRole = currentUser.role || 'Employee';
      this.profileInitial = fullName.charAt(0).toUpperCase();
    }
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  /**
   * Open the profile modal
   */
  openProfile() {
    this.showDropdown = false; // Close dropdown
    if (this.profileModal) {
      this.profileModal.openProfile();
    }
  }

  logout() {
    // Set signal for loghours component to clear state on next init
    localStorage.setItem('clear_loghours_state', 'true');

    // Save the final time log before logging out
    this.timeLogService.saveDailyTimeLog();

    this.authService.logout();
    // AuthService.logout() already navigates to /signin, so no need to navigate again
  }
}

