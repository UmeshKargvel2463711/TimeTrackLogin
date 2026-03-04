import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TimeLogService } from '../../../core/services/time-log.service';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  TeamSummaryDto,
  TeamHoursTrendDto,
  TeamMemberPerformanceDto,
  TaskCompletionBreakdownDto,
  MemberPerformance
} from '../../../core/models/analytics.model';
import { Subject, takeUntil, forkJoin } from 'rxjs';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-team-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-analytics.component.html',
  styleUrls: ['./team-analytics.component.css']
})
export class TeamAnalyticsComponent implements OnInit, AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();

  private trendChart: any;
  private memberChart: any;
  private completionChart: any;
  private chartsInitialized = false;

  // Data properties from backend
  teamSummary: TeamSummaryDto | null = null;
  hoursTrend: TeamHoursTrendDto | null = null;
  memberPerformance: TeamMemberPerformanceDto | null = null;
  taskBreakdown: TaskCompletionBreakdownDto | null = null;

  // Loading states
  loading = false;
  error: string | null = null;

  // Date range (default: last 30 days)
  startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  endDate: Date = new Date();

  constructor(
    private analyticsService: AnalyticsService,
    private notificationService: NotificationService,
    private timeLogService: TimeLogService,
    private apiService: ApiService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    // Data will be loaded after charts are initialized in ngAfterViewInit
  }

  ngAfterViewInit(): void {
    // Delay to ensure DOM is ready, then initialize charts
    setTimeout(() => {
      this.initCharts();
      // If charts initialized successfully, try to load data from backend
      if (this.chartsInitialized) {
        this.loadAllAnalytics();
      } else {
        // Retry chart initialization after a longer delay
        setTimeout(() => {
          this.initCharts();
          if (this.chartsInitialized) {
            this.loadAllAnalytics();
          } else {
          }
        }, 500);
      }
    }, 100);
  }

  /**
   * Load all analytics data from existing backend APIs (time logs + tasks)
   */
  loadAllAnalytics(): void {
    this.loading = true;
    this.error = null;

    const managerId = this.getCurrentManagerId();
    if (!managerId) {
      this.notificationService.error('Unable to load analytics - Manager ID not found');
      this.loadMockData();
      return;
    }

    // Use existing APIs: time logs and tasks created by manager
    // Note: getTasksCreatedByMe may fail with 403 if not authenticated
    forkJoin({
      timeLogs: this.timeLogService.getTeamTimeLogsV2(managerId),
      tasks: this.apiService.getTasksCreatedByMe()
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {

          const timeLogs = results.timeLogs.success ? results.timeLogs.data : [];
          const tasks = results.tasks || [];

          // Calculate analytics from raw data
          this.calculateAnalytics(timeLogs, tasks);

          this.loading = false;
        },
        error: (err) => {
          this.error = null;
          // Try loading from localStorage as fallback
          this.loadFromLocalStorage(managerId);
          this.loading = false;
        }
      });
  }

  /**
   * Load data from localStorage as fallback when API fails
   */
  private loadFromLocalStorage(managerId: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedTimeLogs = localStorage.getItem('team_time_logs');
      const storedTasks = localStorage.getItem('manager_tasks');

      let timeLogs: any[] = [];
      let tasks: any[] = [];

      if (storedTimeLogs) {
        try {
          timeLogs = JSON.parse(storedTimeLogs);
        } catch (e) {
        }
      }

      if (storedTasks) {
        try {
          tasks = JSON.parse(storedTasks);
        } catch (e) {
        }
      }

      if (timeLogs.length > 0 || tasks.length > 0) {
        this.calculateAnalytics(timeLogs, tasks);
        this.notificationService.info('Loaded cached data from previous session');
      } else {
        this.notificationService.info('No data available - Using sample data');
        this.loadMockData();
      }
    } else {
      this.loadMockData();
    }
  }

  /**
   * Get current manager ID from auth session
   */
  private getCurrentManagerId(): string | null {
    const user = this.authService.currentUser();
    return user?.userId || user?.id || null;
  }

  /**
   * Calculate analytics from time logs and tasks
   */
  private calculateAnalytics(timeLogs: any[], tasks: any[]): void {

    // Calculate team summary
    const totalHours = timeLogs.reduce((sum, log) => sum + (log.hoursSpent || log.totalHours || 0), 0);
    const uniqueEmployees = new Set(timeLogs.map(log => log.employeeId || log.userId)).size;
    const avgHours = uniqueEmployees > 0 ? totalHours / uniqueEmployees : 0;

    const completedTasks = tasks.filter(t => t.status === 'Completed' || t.status === 'Approved').length;
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    this.teamSummary = {
      totalTeamHours: Math.round(totalHours * 10) / 10,
      averageHoursPerMember: Math.round(avgHours * 10) / 10,
      completionRate,
      completedTasksCount: completedTasks,
      totalTasksCount: totalTasks,
      teamMemberCount: uniqueEmployees,
      calculatedFrom: this.startDate.toISOString(),
      calculatedTo: this.endDate.toISOString()
    };

    // Calculate trend data (group by date)
    const trendMap = new Map<string, { hours: number, tasks: number, members: Set<string> }>();
    timeLogs.forEach(log => {
      const date = new Date(log.date || log.loggedDate).toISOString().split('T')[0];
      if (!trendMap.has(date)) {
        trendMap.set(date, { hours: 0, tasks: 0, members: new Set() });
      }
      const entry = trendMap.get(date)!;
      entry.hours += log.hoursSpent || log.totalHours || 0;
      entry.members.add(log.employeeId || log.userId);
    });

    tasks.forEach(task => {
      if (task.completedDate) {
        const date = new Date(task.completedDate).toISOString().split('T')[0];
        if (trendMap.has(date)) {
          trendMap.get(date)!.tasks++;
        }
      }
    });

    const sortedDates = Array.from(trendMap.keys()).sort();
    this.hoursTrend = {
      trendData: sortedDates.map(date => ({
        date: new Date(date).toISOString(),
        totalHours: trendMap.get(date)!.hours,
        tasksCompleted: trendMap.get(date)!.tasks,
        activeMembers: trendMap.get(date)!.members.size
      }))
    };

    // Calculate member performance
    const memberMap = new Map<string, any>();
    timeLogs.forEach(log => {
      const id = log.employeeId || log.userId;
      const name = log.employeeName || log.employee || 'Unknown';
      if (!memberMap.has(id)) {
        memberMap.set(id, {
          userId: id,
          name,
          email: log.employeeEmail || '',
          totalHours: 0,
          tasksAssigned: 0,
          tasksCompleted: 0,
          tasksInProgress: 0,
          tasksPending: 0,
          overdueTasksCount: 0
        });
      }
      memberMap.get(id)!.totalHours += log.hoursSpent || log.totalHours || 0;
    });

    tasks.forEach(task => {
      const id = task.assignedToUserId;
      if (memberMap.has(id)) {
        const member = memberMap.get(id)!;
        member.tasksAssigned++;
        if (task.status === 'Completed' || task.status === 'Approved') member.tasksCompleted++;
        else if (task.status === 'InProgress' || task.status === 'In Progress') member.tasksInProgress++;
        else if (task.status === 'Pending') member.tasksPending++;
        if (task.isOverdue) member.overdueTasksCount++;
      }
    });

    this.memberPerformance = {
      members: Array.from(memberMap.values()).map(m => ({
        ...m,
        efficiencyScore: m.tasksAssigned > 0 ? Math.round((m.tasksCompleted / m.tasksAssigned) * 100) : 0,
        performanceStatus: (() => {
          const score = m.tasksAssigned > 0 ? (m.tasksCompleted / m.tasksAssigned) * 100 : 0;
          return score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : 'Needs Attention';
        })() as 'Excellent' | 'Good' | 'Needs Attention',
        averageTaskCompletionTime: m.tasksCompleted > 0 ? m.totalHours / m.tasksCompleted : 0
      }))
    };

    // Calculate task breakdown
    const completed = tasks.filter(t => t.status === 'Completed' || t.status === 'Approved').length;
    const inProgress = tasks.filter(t => t.status === 'InProgress' || t.status === 'In Progress').length;
    const pending = tasks.filter(t => t.status === 'Pending').length;
    const overdue = tasks.filter(t => t.isOverdue).length;
    const rejected = tasks.filter(t => t.isRejected).length;

    this.taskBreakdown = {
      completedCount: completed,
      inProgressCount: inProgress,
      pendingCount: pending,
      rejectedCount: rejected,
      overdueCount: overdue,
      totalCount: tasks.length,
      completionPercentage: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0
    };

    // Update charts
    setTimeout(() => {
      this.updateTrendChart();
      this.updateMemberChart();
      this.updateCompletionChart();
    }, 100);
  }

  /**
   * Handle date range change
   */
  onDateRangeChange(): void {
    if (this.startDate && this.endDate && this.startDate <= this.endDate) {
      this.loadAllAnalytics();
    } else {
      this.notificationService.error('Invalid date range');
    }
  }

  /**
   * Initialize all charts
   */
  private initCharts(): void {

    try {
      const trendCanvas = document.getElementById('trendChart');
      const memberCanvas = document.getElementById('memberChart');
      const completionCanvas = document.getElementById('completionChart');

      if (!trendCanvas || !memberCanvas || !completionCanvas) {
        this.chartsInitialized = false;
        return;
      }

      // Initialize trend chart
      this.trendChart = new Chart('trendChart', {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Total Hours',
            data: [],
            borderColor: '#4F46E5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  const value = context.parsed.y || 0;
                  const hours = Math.floor(value);
                  const minutes = Math.round((value - hours) * 60);
                  return `Total Hours: ${hours}h ${minutes}m`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Hours' },
              ticks: {
                stepSize: 1,
                callback: function (value: any) {
                  return Number.isInteger(value) ? value : '';
                }
              }
            }
          }
        }
      });

      // Initialize member chart
      this.memberChart = new Chart('memberChart', {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Hours Logged',
            data: [],
            backgroundColor: '#10B981',
            borderColor: '#059669',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  const value = context.parsed.y || 0;
                  const hours = Math.floor(value);
                  const minutes = Math.round((value - hours) * 60);
                  return `Hours Logged: ${hours}h ${minutes}m`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Hours' },
              ticks: {
                stepSize: 1,
                callback: function (value: any) {
                  return Number.isInteger(value) ? value : '';
                }
              }
            }
          }
        }
      });

      // Initialize completion chart
      this.completionChart = new Chart('completionChart', {
        type: 'doughnut',
        data: {
          labels: ['Completed', 'In Progress', 'Pending', 'Overdue'],
          datasets: [{
            data: [0, 0, 0, 0],
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });

      this.chartsInitialized = true;

    } catch (error) {
    }
  }

  /**
   * Update trend chart with backend data
   */
  private updateTrendChart(): void {
    if (!this.trendChart || !this.chartsInitialized || !this.hoursTrend) {
      return;
    }

    try {
      if (!this.hoursTrend.trendData || this.hoursTrend.trendData.length === 0) {
        return;
      }

      const labels = this.hoursTrend.trendData.map(d =>
        new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      );
      const data = this.hoursTrend.trendData.map(d => d.totalHours);

      this.trendChart.data.labels = labels;
      this.trendChart.data.datasets[0].data = data;
      this.trendChart.update('active');
    } catch (error) {
    }
  }

  /**
   * Update member chart with backend data
   */
  private updateMemberChart(): void {
    if (!this.memberChart || !this.chartsInitialized || !this.memberPerformance) {
      return;
    }

    try {
      if (!this.memberPerformance.members || this.memberPerformance.members.length === 0) {
        return;
      }

      const labels = this.memberPerformance.members.map(m => m.name);
      const data = this.memberPerformance.members.map(m => m.totalHours);

      this.memberChart.data.labels = labels;
      this.memberChart.data.datasets[0].data = data;
      this.memberChart.update('active');
    } catch (error) {
    }
  }

  /**
   * Update completion chart with backend data
   */
  private updateCompletionChart(): void {
    if (!this.completionChart || !this.chartsInitialized || !this.taskBreakdown) {
      return;
    }

    try {
      const data = [
        this.taskBreakdown.completedCount || 0,
        this.taskBreakdown.inProgressCount || 0,
        this.taskBreakdown.pendingCount || 0,
        this.taskBreakdown.overdueCount || 0
      ];

      this.completionChart.data.datasets[0].data = data;
      this.completionChart.update('active');
    } catch (error) {
    }
  }

  /**
   * Load mock data for development when backend is not ready
   * Public method so it can be triggered from UI for testing
   */
  loadMockData(): void {

    // Clear loading and error states
    this.loading = false;
    this.error = null;

    // Mock team summary
    this.teamSummary = {
      totalTeamHours: 856.5,
      averageHoursPerMember: 107.1,
      completionRate: 78,
      completedTasksCount: 42,
      totalTasksCount: 54,
      teamMemberCount: 8,
      calculatedFrom: this.startDate.toISOString(),
      calculatedTo: this.endDate.toISOString()
    };

    // Mock hours trend data (last 7 days)
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      trendData.push({
        date: date.toISOString(),
        totalHours: 50 + Math.random() * 30,
        tasksCompleted: Math.floor(3 + Math.random() * 5),
        activeMembers: 6 + Math.floor(Math.random() * 3)
      });
    }
    this.hoursTrend = { trendData };

    // Mock member performance
    const mockMembers = [
      { name: 'John Doe', email: 'john@company.com', hours: 168.5, tasks: 12, completed: 11, efficiency: 92 },
      { name: 'Jane Smith', email: 'jane@company.com', hours: 152.0, tasks: 10, completed: 9, efficiency: 90 },
      { name: 'Bob Johnson', email: 'bob@company.com', hours: 135.5, tasks: 9, completed: 7, efficiency: 78 },
      { name: 'Alice Williams', email: 'alice@company.com', hours: 124.0, tasks: 8, completed: 6, efficiency: 75 },
      { name: 'Charlie Brown', email: 'charlie@company.com', hours: 118.5, tasks: 10, completed: 7, efficiency: 70 },
      { name: 'Diana Prince', email: 'diana@company.com', hours: 98.0, tasks: 7, completed: 6, efficiency: 86 },
      { name: 'Eve Davis', email: 'eve@company.com', hours: 82.5, tasks: 6, completed: 4, efficiency: 67 },
      { name: 'Frank Miller', email: 'frank@company.com', hours: 77.5, tasks: 5, completed: 4, efficiency: 80 }
    ];

    this.memberPerformance = {
      members: mockMembers.map((m, i) => ({
        userId: `user-${i + 1}`,
        name: m.name,
        email: m.email,
        totalHours: m.hours,
        tasksAssigned: m.tasks,
        tasksCompleted: m.completed,
        tasksInProgress: m.tasks - m.completed > 0 ? 1 : 0,
        tasksPending: m.tasks - m.completed - 1 > 0 ? m.tasks - m.completed - 1 : 0,
        efficiencyScore: m.efficiency,
        performanceStatus: m.efficiency >= 90 ? 'Excellent' : m.efficiency >= 70 ? 'Good' : 'Needs Attention',
        averageTaskCompletionTime: m.hours / m.completed,
        overdueTasksCount: Math.floor(Math.random() * 2)
      }))
    };

    // Mock task breakdown
    this.taskBreakdown = {
      completedCount: 42,
      inProgressCount: 8,
      pendingCount: 4,
      rejectedCount: 2,
      overdueCount: 3,
      totalCount: 54,
      completionPercentage: 77.78
    };

    // Update charts with mock data
    setTimeout(() => {
      this.updateTrendChart();
      this.updateMemberChart();
      this.updateCompletionChart();
    }, 100);
  }

  /**
   * Format decimal hours to HH:MM format (e.g., 1.5 -> "1h 30m")
   */
  formatHours(decimalHours: number): string {
    if (!decimalHours || decimalHours === 0) {
      return '0h 0m';
    }
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Get performance badge class
   */
  getPerformanceClass(status: string): string {
    switch (status) {
      case 'Excellent': return 'badge-success';
      case 'Good': return 'badge-info';
      case 'Needs Attention': return 'badge-warning';
      default: return 'badge-secondary';
    }
  }

  /**
   * Get days between start and end date
   */
  getDaysDiff(): number {
    const diff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up charts
    if (this.trendChart) {
      this.trendChart.destroy();
    }
    if (this.memberChart) {
      this.memberChart.destroy();
    }
    if (this.completionChart) {
      this.completionChart.destroy();
    }
  }
}
