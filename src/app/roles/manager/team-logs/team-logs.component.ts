import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimeLogService } from '../../../core/services/time-log.service';
import { UserService } from '../../../core/services/user.service';
import { TeamTimeLogDto, TeamMemberDto } from '../../../core/models/time-log.model';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface TimeLogDisplay extends TeamTimeLogDto {
  displayHours?: string;
  elapsedTime?: string;
}

@Component({
  selector: 'app-team-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-logs.component.html',
  styleUrls: ['./team-logs.component.css']
})
export class TeamLogsComponent implements OnInit, OnDestroy {
  private timeLogService = inject(TimeLogService);
  private userService = inject(UserService);
  private destroy$ = new Subject<void>();

  readonly today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  readonly currentWeekDates = this.getCurrentWeekDates();

  managerId: string = '';
  allLogs: TeamTimeLogDto[] = [];
  uniqueMembers: string[] = [];
  filteredLogs: TeamTimeLogDto[] = [];
  teamMembers: TeamMemberDto[] = [];
  
  teamMembersCount = 0;
  teamHoursToday = 0;
  teamLogs: any[] = [];
  stats: any = null;

  // Filters
  selectedMember: string = 'All Team Members';
  selectedMemberId: string = 'All';
  selectedTimeFrame: string = 'Today';
  selectedPeriod: string = 'Today';

  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    const managerId = this.getCurrentManagerId();
    if (!managerId) {
      return;
    }

    this.managerId = managerId;
    this.loadAllData();

    // Auto-refresh every 1 second for live updates
    this.refreshSubscription = interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateLiveSessions();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.refreshSubscription?.unsubscribe();
  }

  // ---------------- Data Loading ----------------

  private loadAllData(): void {
    this.loadTeamLogs();
    this.loadTeamMembers();
    this.loadDashboardStats();
  }

  private loadTeamLogs(): void {
    this.timeLogService.getTeamTimeLogsV2(this.managerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && Array.isArray(response.data)) {
            this.allLogs = response.data;
            this.uniqueMembers = Array.from(new Set(this.allLogs.map(l => l.employeeName)));
            this.applyFilters();
            this.updateLiveSessions();
          }
        },
        error: (err) => {
          if (err.status === 404) {
            this.allLogs = [];
            this.filteredLogs = [];
          }
        }
      });
  }

  private loadTeamMembers(): void {
    this.userService.getMyTeam()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && Array.isArray(response.data)) {
            this.teamMembers = response.data;
            this.teamMembersCount = this.teamMembers.length;
          }
        },
        error: (err) => console.error('Error loading team members:', err)
      });
  }

  private loadDashboardStats(): void {
    this.timeLogService.getManagerDashboardStats(this.managerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          if (stats) {
            this.stats = stats;
            this.teamHoursToday = stats.teamHoursToday || 0;
          }
        },
        error: (err) => console.error('Error loading dashboard stats:', err)
      });
  }

  // ---------------- Live Session Updates ----------------

  private updateLiveSessions(): void {
    this.filteredLogs.forEach(log => {
      if (this.isLiveSession(log)) {
        (log as any).elapsedTime = this.calculateElapsedTime(log.date, log.startTime);
      }
    });
  }

  isLiveSession(log: TeamTimeLogDto): boolean {
    return log.status === 'In Progress' || 
           log.endTime === null || 
           log.endTime === '00:00:00' || 
           log.totalHours === 0;
  }

  calculateElapsedTime(date: string, startTime: string): string {
    const logDate = new Date(date);
    const [hours, minutes, seconds] = startTime.split(':').map(Number);
    
    const startDateTime = new Date(
      logDate.getFullYear(),
      logDate.getMonth(),
      logDate.getDate(),
      hours,
      minutes,
      seconds || 0
    );

    const now = new Date();
    const elapsedMs = now.getTime() - startDateTime.getTime();
    
    if (elapsedMs < 0) return '0h 0m 0s';
    
    const h = Math.floor(elapsedMs / 3600000);
    const m = Math.floor((elapsedMs % 3600000) / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);

    return `${h}h ${m}m ${s}s`;
  }

  // ---------------- Filters & UI ----------------

  filterLogs() {
    this.selectedPeriod = this.selectedTimeFrame;
    this.selectedMemberId = this.selectedMember === 'All Team Members' ? 'All' : this.selectedMember;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.allLogs];

    // Filter by member
    if (this.selectedMember !== 'All Team Members') {
      filtered = filtered.filter(log => log.employeeName === this.selectedMember);
    }

    // Filter by time period
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (this.selectedTimeFrame) {
      case 'Today':
        filtered = filtered.filter(log => {
          const logDate = new Date(log.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === today.getTime();
        });
        break;

      case 'This Week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        filtered = filtered.filter(log => {
          const logDate = new Date(log.date);
          return logDate >= weekStart && logDate <= today;
        });
        break;

      case 'All Time':
      default:
        // No filtering
        break;
    }

    this.filteredLogs = filtered;
  }

  updateDashboard() {
    this.filterLogs();
  }

  get displayedMembers(): TeamMemberDto[] {
    if (this.selectedMember === 'All Team Members') {
      return this.teamMembers;
    }
    return this.teamMembers.filter(m => m.name === this.selectedMember);
  }

  getElapsedTime(startTime: string): string {
    const today = new Date();
    return this.calculateElapsedTime(today.toISOString(), startTime);
  }

  formatHours(hours: number | undefined): string {
    return hours ? hours.toFixed(2) : '0.00';
  }

  formatBreakMinutes(value: number | string | undefined): string {
    if (typeof value === 'number') {
      // Convert minutes to HH:MM format
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }
      return `${minutes}m`;
    }
    if (!value) return '0m';
    
    const parts = value.toString().split(':').map(Number);
    if (parts.length < 2 || parts.some(Number.isNaN)) return value.toString();
    const [hours, minutes] = parts;
    const totalMinutes = (hours || 0) * 60 + (minutes || 0);
    
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) {
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${m}m`;
  }

  convertTo12HourFormat(time24: string): string {
    if (!time24) return '--:-- --';
    
    // Extract hours and minutes from formats like '13:55:00' or '13:55'
    const timeParts = time24.split(':');
    if (timeParts.length < 2) return time24;
    
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes)) return time24;
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  get summaryStats() {
    const data = this.filteredLogs;
    if (data.length === 0) return { total: '0h 0m', avg: '0h 0m', entries: 0 };

    const totalHours = data.reduce((sum, log) => sum + (log.totalHours || 0), 0);
    const uniqueDays = new Set(data.map(l => this.formatLogDate(l.date))).size;
    const avgHours = totalHours / (uniqueDays || 1);

    return {
      total: this.formatHoursToHHMM(totalHours),
      avg: this.formatHoursToHHMM(avgHours),
      entries: data.length
    };
  }

  getMemberStats(name: string) {
    const memberLogs = this.allLogs.filter(l => l.employeeName === name);
    let timeframeLogs: TeamTimeLogDto[] = [];

    if (this.selectedTimeFrame === 'Today') {
      timeframeLogs = memberLogs.filter(l => this.formatLogDate(l.date) === this.today);
    } else if (this.selectedTimeFrame === 'This Week') {
      timeframeLogs = memberLogs.filter(l => this.currentWeekDates.includes(this.formatLogDate(l.date)));
    } else if (this.selectedTimeFrame === 'All Time') {
      timeframeLogs = memberLogs;
    }

    const totalHours = timeframeLogs.reduce((s, l) => s + (l.totalHours || 0), 0);

    return {
      hours: this.formatHoursToHHMM(totalHours),
      days: new Set(timeframeLogs.map(l => this.formatLogDate(l.date))).size
    };
  }

  // ---------------- Helpers ----------------

  formatHoursToHHMM(decimalHours: number): string {
    if (!decimalHours || decimalHours < 0) return '0m';
    
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }

  private getCurrentWeekDates(): string[] {
    const dates: string[] = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    return dates;
  }

  private getCurrentManagerId(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const saved = localStorage.getItem('user_session');
    if (!saved) return null;
    try {
      const user = JSON.parse(saved);
      const id = user.userId ?? user.id;
      if (!id) return null;
      return typeof id === 'string' ? id : String(id);
    } catch {
      return null;
    }
  }

  private formatLogDate(dateValue: string): string {
    const d = new Date(dateValue);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
