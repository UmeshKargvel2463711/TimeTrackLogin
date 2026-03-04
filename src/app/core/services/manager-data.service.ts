import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, interval } from 'rxjs';
import { map, startWith, tap, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { TimeLogService } from './time-log.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ManagerDataService {
  private apiService = inject(ApiService);
  private timeLogService = inject(TimeLogService);
  private authService = inject(AuthService);

  // User session management
  private currentUserSubject = new BehaviorSubject<any>(this.getSavedUser());
  currentUser$ = this.currentUserSubject.asObservable();

  // Reactive data streams - will be populated from backend
  private logsSubject = new BehaviorSubject<any[]>([]);
  private tasksSubject = new BehaviorSubject<any[]>([]);
  private perfSubject = new BehaviorSubject<any[]>([]);

  logs$ = this.logsSubject.asObservable();
  tasks$ = this.tasksSubject.asObservable();
  performance$ = this.perfSubject.asObservable();

  constructor() {
    // Initialize from AuthService currentUser signal
    const authUser = this.authService.currentUser();
    if (authUser) {
      const name = authUser.fullName || authUser.firstName || authUser.name || 'User';
      this.currentUserSubject.next({
        name: name,
        role: authUser.role,
        initial: name.charAt(0).toUpperCase()
      });
    }
    // Load from localStorage on initialization
    this.loadFromLocalStorage();
  }

  /**
   * Load data from localStorage (no API calls)
   */
  private loadFromLocalStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const storedLogs = localStorage.getItem('team_time_logs');
        const storedTasks = localStorage.getItem('manager_tasks');

        if (storedLogs) {
          const logs = JSON.parse(storedLogs);
          this.logsSubject.next(logs);
        }

        if (storedTasks) {
          const tasks = JSON.parse(storedTasks);
          this.tasksSubject.next(tasks);
        }
      } catch (e) {
      }
    }
  }

  /**
   * Load all team data from backend APIs (manual call only)
   */
  private loadTeamData() {

    this.getTeamDataFromBackend().subscribe(
      (data: any) => {
        if (data.logs) {
          this.logsSubject.next(data.logs);
          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('team_time_logs', JSON.stringify(data.logs));
          }
        }
        if (data.tasks) {
          this.tasksSubject.next(data.tasks);
          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('manager_tasks', JSON.stringify(data.tasks));
          }
        }
      },
      (err) => {
      }
    );
  }

  /**
   * Get team data from backend
   */
  private getTeamDataFromBackend(): Observable<any> {
    return combineLatest([
      this.apiService.getTimeLogs().pipe(startWith([])),
      this.apiService.getTasksCreatedByMe().pipe(startWith([]))
    ]).pipe(
      map(([logs, tasks]) => {
        console.log('📊 Team data received - Logs:', logs.length, 'Tasks (created by manager):', tasks.length);
        return { logs, tasks };
      })
    );
  }

  /**
   * Manually refresh team data from backend (call this from components when authenticated)
   */
  refreshTeamData(): void {
    this.loadTeamData();
  }

  /**
   * Get team analytics - combines logs and tasks
   */
  getTeamAnalytics(): Observable<any> {
    return combineLatest([this.logs$, this.tasks$]).pipe(
      map(([logs, tasks]) => ({
        logs,
        tasks,
        summary: this.calculateSummary(logs, tasks)
      }))
    );
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(logs: any[], tasks: any[]) {
    const totalHours = logs.reduce((sum, log) => sum + (log.totalHours || 0), 0);
    const members = new Set(logs.map(l => l.employee || l.employeeName)).size;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const completionRate = tasks.length > 0
      ? Math.round((completedTasks / tasks.length) * 100)
      : 0;

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: members > 0 ? Math.round((totalHours / members) * 10) / 10 : 0,
      completionRate,
      completedTasks,
      inProgressTasks,
      totalTasks: tasks.length,
      teamMembers: members
    };
  }

  /**
   * Get team performance by member
   */
  getTeamPerformanceByMember(logs: any[]): any[] {
    const memberData: { [key: string]: any } = {};

    logs.forEach(log => {
      const employeeName = log.employee || log.employeeName || 'Unknown';
      if (!memberData[employeeName]) {
        memberData[employeeName] = {
          name: employeeName,
          hours: 0,
          days: 0
        };
      }
      memberData[employeeName].hours += log.totalHours || 0;
    });

    // Calculate days and efficiency for each employee
    Object.values(memberData).forEach((emp: any) => {
      // Assume each log entry might be a different day
      emp.days = Math.max(1, Math.ceil(emp.hours / 8));
      emp.efficiency = Math.min(Math.round((emp.hours / (emp.days * 8)) * 100), 100);

      if (emp.efficiency >= 90) {
        emp.status = 'Excellent';
      } else if (emp.efficiency >= 70) {
        emp.status = 'Good';
      } else {
        emp.status = 'Needs Attention';
      }
    });

    return Object.values(memberData);
  }

  /**
   * Refresh data manually
   */
  refreshData() {
    this.loadTeamData();
  }

  // Retrieve saved user from localStorage
  private getSavedUser() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('user_session');
      if (saved) {
        const user = JSON.parse(saved);
        const name = user.fullName || user.firstName || 'Manager';
        return {
          name: name,
          role: user.role,
          initial: name.charAt(0).toUpperCase()
        };
      }
    }
    return { name: 'Loading...', role: '', initial: '' };
  }

  // Update current user session
  setUser(name: string, role: string) {
    this.currentUserSubject.next({
      name: name,
      role: role,
      initial: name.charAt(0).toUpperCase()
    });
  }

  // Clear user session on logout
  clearUser() {
    this.currentUserSubject.next({
      name: 'Loading...',
      role: '',
      initial: ''
    });
  }

  // Add new time log entry
  addLog(log: any) {
    const current = this.logsSubject.value;
    this.logsSubject.next([...current, log]);
  }

  // Add new task
  addTask(task: any) {
    const currentTasks = this.tasksSubject.value;
    this.tasksSubject.next([task, ...currentTasks]);
  }

  // Remove task by index
  deleteTask(index: number) {
    const currentTasks = this.tasksSubject.value;
    currentTasks.splice(index, 1);
    this.tasksSubject.next([...currentTasks]);
  }
}
