import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TimeLogService } from '../../../core/services/time-log.service';
import { TaskService, Task } from '../../../core/services/task.service';
import { ApiResponse } from '../../../core/models/time-log.model';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboardemployee.component.html',
  styleUrl: './dashboardemployee.component.css',
})
export class DashboardemployeeComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private timeLogService = inject(TimeLogService);
  private taskService = inject(TaskService);

  employeeName: string = 'Employee';
  userRole: string = 'Employee';

  // Quick stats
  totalHoursToday: number = 0;
  totalHoursWeek: number = 0;
  completedTasks: number = 0;
  inProgressTasks: number = 0;
  pendingTasks: number = 0;
  taskCompletionRate: number = 0;

  ngOnInit() {
    // Get current user from AuthService
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      // Use fullName from registered data, not email
      this.employeeName = currentUser.fullName || 'Employee';
      this.userRole = currentUser.role || 'Employee';

      // Load productivity stats
      this.loadStats(currentUser);
    }
  }

  /**
   * Load productivity statistics
   */
  private loadStats(currentUser: any) {
    // Load time logs
    this.timeLogService.getLogs().subscribe((logs: any[]) => {
      const myLogs = logs.filter(log => 
        log.employee === currentUser.fullName || log.employeeId === currentUser.id
      );

      // Calculate today's hours
      const today = new Date().toDateString();
      const todayLogs = myLogs.filter(log => 
        new Date(log.date).toDateString() === today
      );
      this.totalHoursToday = todayLogs.reduce((sum, log) => sum + (log.totalHours || 0), 0);

      // Calculate this week's hours
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekLogs = myLogs.filter(log => new Date(log.date) >= weekAgo);
      this.totalHoursWeek = weekLogs.reduce((sum, log) => sum + (log.totalHours || 0), 0);
    });

    // Load tasks
    this.taskService.getMyTasks().subscribe((myTasks: any[]) => {
      // Approved tasks are considered Completed
      this.completedTasks = myTasks.filter((t: any) => t.status === 'Completed' || t.status === 'Approved').length;
      this.inProgressTasks = myTasks.filter((t: any) => t.status === 'In Progress' || t.status === 'InProgress').length;
      this.pendingTasks = myTasks.filter((t: any) => t.status === 'Pending').length;

      const total = myTasks.length;
      this.taskCompletionRate = total > 0 ? Math.round((this.completedTasks / total) * 100) : 0;
    });
  }
}
