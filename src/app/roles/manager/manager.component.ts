import { Component, OnInit, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterModule } from '@angular/router';
import { ManagerDataService } from '../../core/services/manager-data.service';
import { TimeLogService } from '../../core/services/time-log.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ProfileModalComponent } from '../../shared/profile-modal/profile-modal.component';
import { NotificationComponent } from '../../shared/notification/notification.component';
import { TeamMember } from '../../core/models/time-log.model';

@Component({
  selector: 'app-manager',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, ProfileModalComponent, NotificationComponent],
  templateUrl: './manager.component.html',
  styleUrls: ['./manager.component.css']
})
export class ManagerComponent implements OnInit {
  @ViewChild(ProfileModalComponent) profileModal!: ProfileModalComponent;

  isDropdownOpen = false;
  user: any = { name: '', role: '', initial: '' };

  // Dashboard metrics
  teamCount: number = 0;
  activeTasks: number = 0;
  completionRate: number = 0;

  // Team members list
  teamMembers: TeamMember[] = [];

  constructor(
    private router: Router,
    private dataService: ManagerDataService,
    private authService: AuthService,
    private timeLogService: TimeLogService,
    private userService: UserService,
    private apiService: ApiService
  ) { }

  ngOnInit() {

    // Navbar user info - Get from AuthService first (for immediate display on refresh)
    const authUser = this.authService.currentUser();
    if (authUser) {
      const fullName = authUser.fullName || authUser.firstName || authUser.name || 'Manager';
      this.user = {
        name: fullName,
        role: authUser.role,
        initial: fullName.charAt(0).toUpperCase()
      };
    }

    // Also subscribe to dataService changes for live updates
    this.dataService.currentUser$.subscribe(userData => {
      if (userData && userData.name) {
        const fullName = userData.fullName || userData.name || 'Manager';
        this.user = {
          name: fullName,
          role: userData.role,
          initial: fullName.charAt(0).toUpperCase()
        };
      }
    });

    // Active tasks & completion rate (from data service)
    this.dataService.tasks$.subscribe(tasks => {
      // Active tasks = InProgress tasks only
      const activeTasks = tasks.filter(t => t.status === 'InProgress' || t.status === 'In Progress').length;
      const completedTasks = tasks.filter(t => t.status === 'Completed' || t.status === 'Approved').length;
      const totalTasks = tasks.length;

      // Completion rate = (completed / total) * 100
      this.completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Always update activeTasks count
      this.activeTasks = activeTasks;
    });

    // Force refresh data to ensure it loads
    this.dataService.refreshData();

    // === MAIN: Use new manager-stats API endpoint ===
    // DISABLED: Causes 400 Bad Request errors (backend endpoint not available or not matching)
    // Stats are calculated from dataService.tasks$ subscription instead
    // this.loadManagerStats();

    const managerId = this.getCurrentManagerId();
    if (managerId) {
      // Team members list (+ compute hours from team logs)
      this.loadTeamMembers(managerId);
    }

    // Force check after delay if data is still 0
    setTimeout(() => {
      if (this.activeTasks === 0 && this.completionRate === 0) {
        this.dataService.refreshData();
      }
    }, 1500);
  }

  /**
   * Load manager dashboard statistics from new API endpoint
   */
  private loadManagerStats(): void {
    const managerId = this.getCurrentManagerId();
    if (!managerId) {
      return;
    }

    this.apiService.getManagerStats(managerId).subscribe({
      next: (response) => {
        if (response && response.success && response.data) {
          const stats = response.data;
          this.teamCount = stats.teamMemberCount || 0;
          // Don't override activeTasks and completionRate from tasks$ subscription
          // Only use API stats if tasks$ hasn't provided data yet
          if (this.activeTasks === 0) {
            this.activeTasks = stats.activeTasks || 0;
          }
          if (this.completionRate === 0) {
            this.completionRate = Math.round(stats.completionRate || 0);
          }
          console.log('✅ Manager stats loaded (teamCount only):', stats);
        } else if (response && !response.success) {
          this.fallbackToOldStats();
        }
      },
      error: (err) => {
        this.fallbackToOldStats();
      }
    });
  }

  /**
   * Fallback to old stats calculation if new API fails
   */
  private fallbackToOldStats(): void {
    const managerId = this.getCurrentManagerId();
    if (managerId) {
      this.timeLogService.getManagerStats(managerId).subscribe(stats => {
        if (stats) {
          this.teamCount = (stats as any).teamCount ?? 0;
          if ((stats as any).activeTasks !== undefined) {
            this.activeTasks = (stats as any).activeTasks;
          }
        } else {
          this.timeLogService.getTeamMembersCount(managerId).subscribe(teamCount => {
            this.teamCount = teamCount;
          });
        }
      });
    }
  }

  /**
   * Load team members and compute their total hours from team time logs
   */
  private loadTeamMembers(managerId: string): void {
    this.userService.getTeamMembers(managerId).subscribe(users => {
      this.timeLogService.getTeamTimeLogs(managerId).subscribe(logs => {
        this.teamMembers = users.map(user => {
          // If your TeamTimeLog includes employeeId, prefer ID match; else fallback to name
          const employeeLogs = logs.filter(log =>
            (log as any).employeeId && user.id
              ? (log as any).employeeId === user.id
              : (log.employeeName?.toLowerCase() === user.fullName?.toLowerCase())
          );
          const totalHours = employeeLogs.reduce((sum, log) => sum + (log.totalHours || 0), 0);

          return {
            id: user.id || '',
            name: user.fullName,
            email: user.email,
            totalHours,
            department: user.department,
            status: user.status
          };
        });

        if (this.teamMembers.length > 0) {
          this.teamCount = this.teamMembers.length;
        }
      });
    });
  }

  /**
   * Read current manager ID as GUID string from session.
   * NO number parsing. Returns null if missing.
   */
  private getCurrentManagerId(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const saved = localStorage.getItem('user_session');
    if (!saved) return null;

    try {
      const user = JSON.parse(saved);
      const id = user.userId ?? user.id;  // depending on how you store it
      if (!id) return null;
      return typeof id === 'string' ? id : String(id);
    } catch {
      return null;
    }
  }

  // Toggle user profile dropdown
  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  // Close dropdown when clicking outside
  @HostListener('document:click')
  closeDropdown() {
    this.isDropdownOpen = false;
  }

  /** Open profile modal */
  openProfile() {
    this.isDropdownOpen = false;
    if (this.profileModal) {
      this.profileModal.openProfile();
    }
  }

  /** Navigate to a section under /manager */
  navigateTo(section: string) {
    this.router.navigate(['/manager', section]);
  }

  onLogout() {
    // Clear both services to ensure complete logout
    this.dataService.clearUser();
    this.authService.logout();
    // AuthService.logout() already navigates to /signin, so no need to navigate again
  }
}
