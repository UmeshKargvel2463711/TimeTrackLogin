import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
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
}