import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardComponent } from '../../admin/dashboard/dashboard.component';

// Child Components
import { LogHoursComponent } from '../loghours/loghours.component';
import { TasksComponent } from '../tasksassigned/tasksassigned.component';
import { personalreportsComponent} from '../personalreports/personalreports.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, LogHoursComponent, TasksComponent, personalreportsComponent,],
  templateUrl: './dashboardemployee.component.html',
  styleUrls: ['./dashboardemployee.component.css']
})
export class DashboardemployeeComponent implements OnInit {
  public authService = inject(AuthService);
  private router = inject(Router);

  activeTab = signal<string>('logging');
  showModal = signal<boolean>(false);

  // Centralized Data
  timeLogs = signal<any[]>([
    { date: 'Sun, Dec 15', start: '09:00', end: '17:30', break: 60, total: 7.50 },
    { date: 'Sat, Dec 14', start: '09:00', end: '18:00', break: 60, total: 8.00 },
    { date: 'Fri, Dec 13', start: '09:15', end: '17:45', break: 45, total: 7.75 }
  ]);

  detailedTasks = signal<any[]>([
    { id: 1, title: 'Implement User Authentication Module', status: 'In Progress', currentHours: 13.5, totalHours: 16, progress: 84 },
    { id: 2, title: 'Design Database Schema', status: 'Completed', currentHours: 5.5, totalHours: 8, progress: 68 },
    { id: 3, title: 'Code Review', status: 'Pending', currentHours: 0.0, totalHours: 4, progress: 0 }
  ]);

  newLog = { date: '2025-12-22', start: '09:00', end: '17:45', break: 10 };

  weeklyHours = computed(() => Number(this.timeLogs().reduce((acc, log) => acc + log.total, 0).toFixed(2)));

  ngOnInit() {
    if (!this.authService.currentUser()) this.router.navigate(['/login']);
  }

  setTab(tab: string) { this.activeTab.set(tab); }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}