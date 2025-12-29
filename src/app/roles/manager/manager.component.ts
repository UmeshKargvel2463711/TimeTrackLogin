import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router'; // Import Router
import { TeamLogsComponent } from './team-logs/team-logs.component';
import { TaskManagementComponent } from './task-management/task-management.component';
import { TeamAnalyticsComponent } from './team-analytics/team-analytics.component';

@Component({
  selector: 'app-manager',
  standalone: true,
  imports: [CommonModule, TeamLogsComponent, TaskManagementComponent, TeamAnalyticsComponent],
  templateUrl: './manager.component.html',
  styleUrls: ['./manager.component.css']
})
export class ManagerComponent {
  tab: string = 'logs'; // Default tab matching image 1000024111.png

  constructor(private router: Router) {} // Inject Router

  onLogout() {
    // If you have authentication tokens in localStorage, clear them here:
    // localStorage.removeItem('token');
    
    // Navigate to the hero component path
    this.router.navigate(['/']);
  }

}