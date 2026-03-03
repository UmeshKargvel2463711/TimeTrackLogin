import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { TimeLogService } from '../../../core/services/time-log.service';
import { TaskService, Task } from '../../../core/services/task.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiResponse } from '../../../core/models/time-log.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

Chart.register(...registerables);

@Component({
  selector: 'app-personalreports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './personalreports.component.html',
  styleUrls: ['./personalreports.component.css']
})
export class PersonalreportsComponent implements OnInit, AfterViewInit, OnDestroy { 
  @ViewChild('barChart') barChartCanvas!: ElementRef;
  @ViewChild('pieChart') pieChartCanvas!: ElementRef;

  private timeLogService = inject(TimeLogService);
  private taskService = inject(TaskService);
  private authService = inject(AuthService);
  
  // Subject for unsubscribing
  private destroy$ = new Subject<void>();

  // Stats data
  totalHoursLogged: number = 0;
  taskCompletionRate: number = 0;
  efficiencyScore: number = 0;
  completedTasks: number = 0;
  totalTasks: number = 0;
  inProgressTasks: number = 0;
  pendingTasks: number = 0;
  weeklyAverage: number = 0;

  // Chart data
  lastSevenDaysLabels: string[] = [];
  lastSevenDaysHours: number[] = [];
  taskStatusData = { completed: 0, inProgress: 0, pending: 0 };
  
  // Demo mode flag - set to true to show sample data
  isDemoMode: boolean = false;

  // Chart instances for destroying and recreating
  private barChartInstance: Chart | null = null;
  private pieChartInstance: Chart | null = null;

  ngOnInit() {
    // Load data immediately and ensure it displays
    this.loadProductivityData();
    // ALWAYS load time logs to ensure total hours is calculated
    this.loadTimeLogsForTotalHours();
    
    // Force refresh after a short delay to ensure data is loaded
    setTimeout(() => {
      if (this.totalHoursLogged === 0) {
        this.loadTimeLogsForTotalHours();
      }
    }, 1000);
  }

  ngAfterViewInit() {
    // Initialize empty charts first, will update when data loads
    setTimeout(() => {
      this.createBarChart();
      this.createPieChart();
    }, 100);
  }

  /**
   * Convert decimal hours to "Xh Ym" format
   * Example: 1.5 hours = "1h 30m"
   */
  formatHours(hours: number): string {
    if (hours === 0) return '0m';
    
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    if (wholeHours === 0) {
      return `${minutes}m`;
    } else if (minutes === 0) {
      return `${wholeHours}h`;
    } else {
      return `${wholeHours}h ${minutes}m`;
    }
  }

  /**
   * Get formatted total hours for display
   */
  getFormattedTotalHours(): string {
    return this.formatHours(this.totalHoursLogged);
  }

  /**
   * Get formatted weekly average for display
   */
  getFormattedWeeklyAverage(): string {
    return this.formatHours(this.weeklyAverage);
  }

  /**
   * Load time logs to calculate total hours for last 7 days
   * This runs separately to ensure total hours is always populated
   */
  private loadTimeLogsForTotalHours() {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return;
    }
    
    // Calculate date range for last 7 days
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6); // Last 7 days including today
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const startDate = sevenDaysAgo.toISOString();
    const endDate = today.toISOString();
    
    // Use getUserTimeLogs with date range to get last 7 days data
    this.timeLogService.getUserTimeLogs(startDate, endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (!response || !response.success || !response.data) {
            return;
          }

          const logs = response.data;

          if (logs.length > 0) {
            // Calculate total hours for last 7 days
            const totalFromLogs = logs.reduce((sum: number, log: any) => 
              sum + (log.hoursSpent || log.totalHours || 0), 0);
            
            this.totalHoursLogged = totalFromLogs;
            console.log('✅ Total hours logged (last 7 days):', this.totalHoursLogged);
            
            // Calculate daily breakdown for chart
            this.calculateDailyHours(logs);
          } else {
            this.totalHoursLogged = 0;
            this.initializeEmptyDailyHours();
          }
        },
        error: (err: any) => {
          this.totalHoursLogged = 0;
          this.initializeEmptyDailyHours();
        }
      });
  }
  
  /**
   * Calculate daily hours for the last 7 days from time logs
   */
  private calculateDailyHours(logs: any[]) {
    const today = new Date();
    this.lastSevenDaysLabels = [];
    this.lastSevenDaysHours = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this.lastSevenDaysLabels.push(dateStr);
      
      // Sum hours for this specific day
      const dayLogs = logs.filter((log: any) => {
        const logDate = new Date(log.date || log.loggedDate);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === date.getTime();
      });
      
      const dayHours = dayLogs.reduce((sum: number, log: any) => 
        sum + (log.hoursSpent || log.totalHours || 0), 0);
      
      this.lastSevenDaysHours.push(parseFloat(dayHours.toFixed(2)));
    }
    
    // Calculate weekly average
    const daysWithLogs = this.lastSevenDaysHours.filter(h => h > 0).length;
    this.weeklyAverage = daysWithLogs > 0 
      ? parseFloat((this.totalHoursLogged / daysWithLogs).toFixed(2))
      : 0;
    
    // Update chart with new data
    this.updateChartData();
  }
  
  /**
   * Initialize empty daily hours when no data available
   */
  private initializeEmptyDailyHours() {
    const today = new Date();
    this.lastSevenDaysLabels = [];
    this.lastSevenDaysHours = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this.lastSevenDaysLabels.push(dateStr);
      this.lastSevenDaysHours.push(0);
    }
    
    this.weeklyAverage = 0;
    
    // Update chart with empty data
    this.updateChartData();
  }

  /**
   * Load all productivity data from services
   */
  private loadProductivityData() {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return;
    }

    // Load productivity data from task history
    this.loadProductivityDataFallback(currentUser);
  }

  /**
   * Apply productivity data from API
   */
  private applyProductivityData(data: any) {
    
    this.totalHoursLogged = parseFloat(data.totalHoursLogged) || 0;
    this.taskCompletionRate = parseInt(data.taskCompletionRate) || 0;
    this.efficiencyScore = parseInt(data.efficiencyScore) || 0;
    
    // Completed tasks includes both 'Completed' and 'Approved' status
    // If API returns separate counts, sum them; otherwise use completedTasks
    const completedCount = parseInt(data.completedTasks) || 0;
    const approvedCount = parseInt(data.approvedTasks) || 0;
    this.completedTasks = completedCount + approvedCount;
    
    this.totalTasks = parseInt(data.totalTasks) || 0;
    this.inProgressTasks = parseInt(data.inProgressTasks) || 0;
    this.pendingTasks = parseInt(data.pendingTasks) || 0;
    this.weeklyAverage = parseFloat(data.weeklyAverage) || 0;

    // Parse chart data if available
    if (data.dailyHours && Array.isArray(data.dailyHours)) {
      this.lastSevenDaysHours = data.dailyHours.map((h: any) => parseFloat(h) || 0);
    }

    if (data.taskDistribution) {
      const completedCount = parseInt(data.taskDistribution.completed) || 0;
      const approvedCount = parseInt(data.taskDistribution.approved) || 0;
      this.taskStatusData = {
        completed: completedCount + approvedCount,  // Combine completed and approved for display
        inProgress: parseInt(data.taskDistribution.inProgress) || 0,
        pending: parseInt(data.taskDistribution.pending) || 0
      };
    } else {
      // If no taskDistribution from API, use the counts we calculated
      this.taskStatusData = {
        completed: this.completedTasks,
        inProgress: this.inProgressTasks,
        pending: this.pendingTasks
      };
    }

    // Generate labels for the last 7 days
    const today = new Date();
    this.lastSevenDaysLabels = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this.lastSevenDaysLabels.push(dateStr);
    }
  }

  /**
   * Load demo data for testing/preview purposes
   * REMOVED - only show real data now
   */
  private loadDemoData() {
  }

  /**
   * Fallback: Load productivity data using local calculation
   */
  private loadProductivityDataFallback(currentUser: any) {
    
    // Load time logs
    this.timeLogService.getLogs()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (logs: any[]) => {
          // Filter logs for current employee
          const myLogs = logs.filter(log => 
            log.employee === currentUser.fullName || log.employeeId === currentUser.id
          );

          // Calculate total hours and weekly data
          this.calculateTimeMetrics(myLogs);
        },
        error: (err) => {
          // Show demo data if no real data available
          this.loadDemoData();
        }
      });

    // Load tasks
    this.taskService.getMyTasks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks: Task[]) => {
          // Calculate task metrics
          this.calculateTaskMetrics(tasks);
        },
        error: (err) => {
          // Show demo data if no real data available
          if (this.totalHoursLogged === 0 && this.totalTasks === 0) {
            this.loadDemoData();
          }
        }
      });
  }

  /**
   * Calculate time-based metrics (hours logged, weekly average)
   */
  private calculateTimeMetrics(logs: any[]) {
    if (logs.length === 0) {
      this.totalHoursLogged = 0;
      this.weeklyAverage = 0;
      // Don't show demo data - show real empty state
      return;
    }

    // Calculate total hours
    this.totalHoursLogged = logs.reduce((sum, log) => sum + (log.totalHours || 0), 0);

    // Get last 7 days data
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    this.lastSevenDaysLabels = [];
    this.lastSevenDaysHours = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this.lastSevenDaysLabels.push(dateStr);

      // Sum hours for this day
      const dayLogs = logs.filter(log => {
        const logDate = new Date(log.date);
        return logDate.toDateString() === date.toDateString();
      });

      const dayHours = dayLogs.reduce((sum, log) => sum + (log.totalHours || 0), 0);
      this.lastSevenDaysHours.push(parseFloat(dayHours.toFixed(1)));
    }

    // Calculate weekly average
    const daysWithLogs = new Set(logs.map(log => new Date(log.date).toDateString())).size;
    this.weeklyAverage = daysWithLogs > 0 ? parseFloat((this.totalHoursLogged / daysWithLogs).toFixed(1)) : 0;

    // Refresh charts if there's data
    if (this.lastSevenDaysHours.length > 0) {
      this.refreshCharts();
    }
  }

  /**
   * Calculate task-based metrics (completion rate, efficiency)
   */
  private calculateTaskMetrics(tasks: any[]) {
    if (tasks.length === 0) {
      this.taskCompletionRate = 0;
      this.efficiencyScore = 0;
      this.totalTasks = 0;
      this.taskStatusData = { completed: 0, inProgress: 0, pending: 0 };
      // Don't show demo data - show real empty state
      return;
    }

    this.totalTasks = tasks.length;

    // Count tasks by status - Approved tasks are considered Completed
    this.completedTasks = tasks.filter((t: any) => t.status === 'Completed' || t.status === 'Approved').length;
    this.inProgressTasks = tasks.filter((t: any) => t.status === 'In Progress' || t.status === 'InProgress').length;
    this.pendingTasks = tasks.filter((t: any) => t.status === 'Pending').length;

    // Calculate completion rate
    this.taskCompletionRate = this.totalTasks > 0 
      ? Math.round((this.completedTasks / this.totalTasks) * 100)
      : 0;

    // Calculate efficiency score (completed + in-progress / total)
    const activeAndCompleted = this.completedTasks + this.inProgressTasks;
    this.efficiencyScore = this.totalTasks > 0 
      ? Math.round((activeAndCompleted / this.totalTasks) * 100)
      : 0;

    // Update task status data for pie chart
    this.taskStatusData = {
      completed: this.completedTasks,
      inProgress: this.inProgressTasks,
      pending: this.pendingTasks
    };

    // Refresh charts with new data
    if (this.totalTasks > 0) {
      this.refreshCharts();
    }
  }

  /**
   * Refresh charts after data is loaded
   */
  private refreshCharts() {
    
    // Destroy existing charts if they exist
    if (this.barChartInstance) {
      this.barChartInstance.destroy();
      this.barChartInstance = null;
    }
    if (this.pieChartInstance) {
      this.pieChartInstance.destroy();
      this.pieChartInstance = null;
    }

    // Wait for DOM to update, then create new charts
    setTimeout(() => {
      this.createBarChart();
      this.createPieChart();
    }, 100);
  }

  /**
   * Update chart data without recreating the charts
   */
  private updateChartData() {
    
    // Update bar chart if it exists
    if (this.barChartInstance) {
      this.barChartInstance.data.labels = this.lastSevenDaysLabels;
      this.barChartInstance.data.datasets[0].data = this.lastSevenDaysHours;
      this.barChartInstance.update();
    } else {
    }
    
    // Update pie chart if it exists
    if (this.pieChartInstance) {
      this.pieChartInstance.data.datasets[0].data = [
        this.taskStatusData.completed,
        this.taskStatusData.inProgress,
        this.taskStatusData.pending
      ];
      this.pieChartInstance.update();
    } else {
    }
  }

  /**
   * Create bar chart for daily hours logged
   */
  createBarChart() {
    if (!this.barChartCanvas) {
      return;
    }
    
    // Initialize with empty data if not yet loaded
    const labels = this.lastSevenDaysLabels.length > 0 ? this.lastSevenDaysLabels : ['Loading...'];
    const data = this.lastSevenDaysHours.length > 0 ? this.lastSevenDaysHours : [0];

    this.barChartInstance = new Chart(this.barChartCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours Logged',
          data: data,
          backgroundColor: '#8cc63f',
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        indexAxis: 'x',
        scales: {
          y: {
            beginAtZero: true,
            max: Math.max(8, data.length > 0 ? Math.max(...data) + 1 : 8)
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const hours = context.parsed.y;
                return this.formatHours(hours);
              }
            }
          }
        }
      }
    });
  }

  /**
   * Create pie chart for task status distribution
   */
  createPieChart() {
    if (!this.pieChartCanvas) {
      return;
    }

    this.pieChartInstance = new Chart(this.pieChartCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'In Progress', 'Pending'],
        datasets: [{
          data: [
            this.taskStatusData.completed,
            this.taskStatusData.inProgress,
            this.taskStatusData.pending
          ],
          backgroundColor: ['#10b981', '#3b82f6', '#64748b'],
          borderColor: ['#ffffff', '#ffffff', '#ffffff'],
          borderWidth: 2
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
  
  ngOnDestroy() {
    // Unsubscribe from all subscriptions
    this.destroy$.next();
    this.destroy$.complete();
    
    // Destroy chart instances
    if (this.barChartInstance) {
      this.barChartInstance.destroy();
      this.barChartInstance = null;
    }
    if (this.pieChartInstance) {
      this.pieChartInstance.destroy();
      this.pieChartInstance = null;
    }
  }
}
