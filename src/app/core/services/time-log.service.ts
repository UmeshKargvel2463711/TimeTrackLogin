import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  ApiResponse,
  TeamTimeLog,
  TeamTimeLogDto,
  DashboardStats,
  CreateTimeLogDto,
  TimeLogResponseDto
} from '../models/time-log.model';

export interface TimeLog {
  id?: string;
  employee: string;
  employeeId?: string;
  date: string;
  startTime: string;
  endTime?: string | null;       // Made nullable
  break: number;
  totalHours: number;
  currentHours?: number;
  description?: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'In Progress' | 'Completed';
  createdDate?: Date;
  isLive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TimeLogService {
  private apiService = inject(ApiService);
  private http = inject(HttpClient);

  private readonly baseUrl = '/api';
  private readonly timeLogUrl = `${this.baseUrl}/timelog`;
  private readonly userUrl = `${this.baseUrl}/user`;
  private readonly refreshInterval = 5000;

  private logsSubject = new BehaviorSubject<TimeLog[]>([]);
  logs$ = this.logsSubject.asObservable();

  constructor() {
    // DISABLED: Causes 401 Unauthorized errors on page load
    // Load from localStorage only, no automatic API calls
    // this.loadLogs();
    this.loadLogsFromLocalStorage();

    // Real-time updates disabled - only load data on initialization
    // this.startRealtimeUpdates();
  }

  // ---------------------------
  // Auth header helper
  // ---------------------------

  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (typeof window !== 'undefined' && window.localStorage) {
      const userSession = localStorage.getItem('user_session');
      if (userSession) {
        try {
          const user = JSON.parse(userSession);
          if (user?.token) headers = headers.set('Authorization', `Bearer ${user.token}`);
        } catch {
          // ignore parse errors
        }
      }
    }
    return headers;
  }

  // ---------------------------
  // NEW API ENDPOINTS (Backend v2.0)
  // ---------------------------

  /** Create time log (POST /api/timelog) */
  createTimeLog(dto: CreateTimeLogDto): Observable<ApiResponse<TimeLogResponseDto>> {
    return this.http.post<ApiResponse<TimeLogResponseDto>>(
      this.timeLogUrl,
      dto,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Update time log (PUT /api/timelog/{logId}) */
  updateTimeLog(logId: string, dto: CreateTimeLogDto): Observable<ApiResponse<TimeLogResponseDto>> {
    return this.http.put<ApiResponse<TimeLogResponseDto>>(
      `${this.timeLogUrl}/${logId}`,
      dto,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Delete time log (DELETE /api/timelog/{logId}) */
  deleteTimeLog(logId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(
      `${this.timeLogUrl}/${logId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get time log by ID (GET /api/timelog/{logId}) */
  getTimeLogById(logId: string): Observable<ApiResponse<TimeLogResponseDto>> {
    return this.http.get<ApiResponse<TimeLogResponseDto>>(
      `${this.timeLogUrl}/${logId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get user's time logs (GET /api/timelog/user) */
  getUserTimeLogs(startDate?: string, endDate?: string): Observable<ApiResponse<TimeLogResponseDto[]>> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<ApiResponse<TimeLogResponseDto[]>>(
      `${this.timeLogUrl}/user`,
      { headers: this.getAuthHeaders(), params }
    );
  }

  /** Get total hours (GET /api/timelog/total-hours) */
  getTotalHours(startDate: string, endDate: string): Observable<ApiResponse<number>> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate);

    return this.http.get<ApiResponse<number>>(
      `${this.timeLogUrl}/total-hours`,
      { headers: this.getAuthHeaders(), params }
    );
  }

  /** Get team time logs (GET /api/timelog/team/{managerId}) - NEW STRUCTURE */
  getTeamTimeLogsV2(managerId: string): Observable<ApiResponse<TeamTimeLogDto[]>> {
    const id = encodeURIComponent(managerId);
    return this.http.get<ApiResponse<TeamTimeLogDto[]>>(
      `${this.timeLogUrl}/team/${id}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Approve time log (POST /api/timelog/{logId}/approve) */
  approveTimeLog(logId: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.timeLogUrl}/${logId}/approve`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  // ---------------------------
  // LEGACY METHODS (backward compatibility)
  // ---------------------------

  /** @deprecated Use getTeamTimeLogsV2 instead */
  getTeamTimeLogs(managerId: string): Observable<TeamTimeLog[]> {
    const id = encodeURIComponent(managerId);
    return this.http
      .get<ApiResponse<TeamTimeLogDto[]>>(`${this.timeLogUrl}/team/${id}`, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        map(response => {
          if (!response?.data) return [];
          // Convert new format to legacy format
          return response.data.map(log => ({
            employeeName: log.employeeName,
            date: log.date,
            startTime: log.startTime,
            endTime: log.endTime,
            breakDuration: log.breakDuration.toString(),
            totalHours: log.totalHours
          }));
        }),
        catchError(() => of([]))
      );
  }

  /** Get dashboard stats for manager (team members + hours today) */
  getManagerDashboardStats(managerId: string): Observable<{ teamMembersCount: number; teamHoursToday: number } | null> {
    const id = encodeURIComponent(managerId);
    return this.http
      .get<ApiResponse<{ teamMembersCount: number; teamHoursToday: number }>>(
        `${this.userUrl}/manager-dashboard/${id}`,
        { headers: this.getAuthHeaders() }
      )
      .pipe(
        map(response => response?.data ?? null),
        catchError(() => of(null))
      );
  }

  /** Get dashboard stats via User API */
  getDashboardStats(managerId: string): Observable<DashboardStats | null> {
    const id = encodeURIComponent(managerId);
    return this.http
      .get<ApiResponse<DashboardStats>>(`${this.userUrl}/manager-dashboard/${id}`, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        map(response => response?.data ?? null),
        catchError(() => of(null))
      );
  }

  /** Alias for getDashboardStats */
  getManagerStats(id: string): Observable<DashboardStats | null> {
    return this.getDashboardStats(id);
  }

  // ---------------------------
  // Load & Realtime Updates
  // ---------------------------

  /**
   * Load time logs from localStorage (no API call)
   */
  private loadLogsFromLocalStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem('time_logs');
        if (stored) {
          const logs = JSON.parse(stored);
          this.logsSubject.next(logs);
        } else {
          this.logsSubject.next([]);
        }
      } catch (e) {
        this.logsSubject.next([]);
      }
    }
  }

  /**
   * Load time logs from API (manual call only - use refresh button)
   */
  private loadLogs(): void {
    this.getUserTimeLogs().subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          const logs = response.data.map(log => this.convertToLegacyTimeLog(log));
          this.logsSubject.next(logs);
          // Save to localStorage for future use
          if (typeof window !== 'undefined') {
            localStorage.setItem('time_logs', JSON.stringify(logs));
          }
        }
      },
      error: (err) => {
        // Fallback to localStorage
        this.loadLogsFromLocalStorage();
      }
    });
  }

  /**
   * Manually refresh logs from API (call from components)
   */
  refreshLogs(): void {
    this.loadLogs();
  }

  private startRealtimeUpdates(): void {
    interval(this.refreshInterval).subscribe(() => {
      const currentLogs = this.logsSubject.value;
      const updatedLogs = this.calculateLiveHours(currentLogs);
      this.logsSubject.next(updatedLogs);
    });
  }

  private calculateLiveHours(logs: TimeLog[]): TimeLog[] {
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5);

    return logs.map(log => {
      if (!log?.isLive || log.status !== 'In Progress') return log;

      const hours = this.calculateHours(log.startTime, currentTimeStr, log.break);
      return {
        ...log,
        currentHours: Math.max(0, hours),
        totalHours: Math.max(0, hours)
      };
    });
  }

  private convertToLegacyTimeLog(dto: TimeLogResponseDto): TimeLog {
    return {
      id: dto.logId,
      employee: dto.userName || 'Unknown',
      employeeId: dto.userId,
      date: new Date(dto.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      startTime: dto.startTime,
      endTime: dto.endTime || undefined,
      break: dto.breakDuration,
      totalHours: dto.totalHours,
      description: dto.activity,
      status: dto.endTime === null ? 'In Progress' : 'Completed',
      isLive: dto.endTime === null,
      createdDate: new Date(dto.date)
    };
  }

  /** Derived helpers */
  getTeamMembersCount(managerId: string): Observable<number> {
    return this.getTeamTimeLogs(managerId).pipe(
      map(logs => new Set(logs.map(log => log.employeeName).filter(Boolean)).size)
    );
  }

  getTeamHoursToday(managerId: string, today: Date = new Date()): Observable<number> {
    const todayKey = today.toDateString();
    return this.getTeamTimeLogs(managerId).pipe(
      map(logs => logs.reduce((sum, log) => {
        const logDate = new Date(log.date);
        if (Number.isNaN(logDate.getTime())) return sum;
        return logDate.toDateString() === todayKey ? sum + (log.totalHours || 0) : sum;
      }, 0))
    );
  }

  // ---------------------------
  // Local list utilities (backed by API)
  // ---------------------------

  /** Get all time logs as an observable */
  getLogs(): Observable<TimeLog[]> {
    return this.logs$;
  }

  /** Add a new time log via API and update local stream */
  addLog(log: TimeLog) {
    // Transform to match POST /api/TimeLog endpoint payload requirements
    const payload = {
      date: log.date,                          // string (e.g., "2024-01-15")
      startTime: log.startTime,                // string (e.g., "09:00 AM")
      endTime: log.endTime || '',              // string (e.g., "05:00 PM")
      breakDuration: Math.floor(log.break || 0), // integer (minutes)
      totalHours: Number(log.totalHours || 0),   // decimal
      activity: log.description || ''          // string
    };

    // Get Bearer token from localStorage['user_session']
    const headers = this.getAuthHeaders();

    this.http.post<any>(`${this.baseUrl}/TimeLog`, payload, { headers }).subscribe({
      next: (created) => {
        const current = this.logsSubject.value;
        // Merge created response with original log data
        const newLog: TimeLog = {
          ...log,
          id: created?.id || log.id || `log_${Date.now()}`,
          createdDate: log.createdDate || new Date(),
          status: log.status || 'Pending'
        };
        this.logsSubject.next([...current, newLog]);
      },
      error: (err) => {
        // Fallback: update local store with original log
        const current = this.logsSubject.value;
        const fallbackLog: TimeLog = {
          ...log,
          id: log.id || `log_${Date.now()}`,
          createdDate: log.createdDate || new Date(),
          status: log.status || 'Pending'
        };
        this.logsSubject.next([...current, fallbackLog]);
      }
    });
  }

  /** Update an existing time log via API (recalculates hours if time fields change) */
  updateLog(id: string, updatedLog: Partial<TimeLog>) {
    const currentLogs = this.logsSubject.value;
    const index = currentLogs.findIndex(l => l.id === id);
    if (index === -1) return;

    // Recalculate totalHours if time fields changed
    if (updatedLog.startTime || updatedLog.endTime || updatedLog.break !== undefined) {
      const startTime = updatedLog.startTime ?? currentLogs[index].startTime;
      const endTime = updatedLog.endTime ?? currentLogs[index].endTime;
      const breakTime = updatedLog.break ?? currentLogs[index].break;
      if (startTime && endTime) {
        updatedLog.totalHours = this.calculateHours(startTime, endTime, breakTime);
      }
    }

    const payload = { ...currentLogs[index], ...updatedLog };

    this.apiService.updateTimeLog(id, payload).subscribe({
      next: (result) => {
        currentLogs[index] = result ?? payload;
        this.logsSubject.next([...currentLogs]);
      },
      error: (err) => {
        // Fallback: update local store anyway (remove if you want strict API)
        currentLogs[index] = payload;
        this.logsSubject.next([...currentLogs]);
      }
    });
  }

  /** Remove a time log from local stream (add API delete if available) */
  deleteLog(id: string) {
    // If you have API: this.apiService.deleteTimeLog(id).subscribe(...);
    const current = this.logsSubject.value;
    this.logsSubject.next(current.filter(l => l.id !== id));
  }

  approveLog(id: string) {
    this.updateLog(id, { status: 'Approved' });
  }

  rejectLog(id: string) {
    this.updateLog(id, { status: 'Rejected' });
  }

  getLogsByEmployee(employee: string): TimeLog[] {
    return this.logsSubject.value.filter(
      log => log.employee.toLowerCase() === employee.toLowerCase()
    );
  }

  getLogsByDate(date: string): TimeLog[] {
    return this.logsSubject.value.filter(log => log.date === date);
  }

  getLogsByStatus(status: string): TimeLog[] {
    return this.logsSubject.value.filter(log => log.status === status);
  }

  getTotalHoursByEmployee(employee: string): number {
    return this.getLogsByEmployee(employee).reduce((total, log) => total + log.totalHours, 0);
  }

  // ---------------------------
  // Calculations & Session support
  // ---------------------------

  /** Calculate hours between start and end time minus break (capped at 24h) */
  private calculateHours(startTime: string, endTime: string, breakMinutes: number): number {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;

    // Support midnight crossing
    let workingMinutes = endTotalMin - startTotalMin - breakMinutes;
    if (workingMinutes < 0) workingMinutes += 24 * 60;

    let hours = workingMinutes / 60;
    if (hours > 24) hours = 24;
    return hours;
  }

  /**
   * Persist daily time log from a running timer session (stored in localStorage by UI)
   * - Caps daily hours at 24h
   * - If day boundary crossed, ends at midnight
   */
  saveDailyTimeLog(): void {
    const timerSession = localStorage.getItem('timerSession');
    if (!timerSession) return;

    try {
      const session = JSON.parse(timerSession);
      const sessionStartTime = new Date(session.startTime);
      let currentTime = new Date();

      // If crossed into next day, cap at midnight of the session day
      const sessionDate = new Date(sessionStartTime);
      sessionDate.setHours(0, 0, 0, 0);

      const currentDate = new Date(currentTime);
      currentDate.setHours(0, 0, 0, 0);

      if (currentDate.getTime() > sessionDate.getTime()) {
        currentTime = new Date(sessionDate);
        currentTime.setDate(currentTime.getDate() + 1); // midnight next day
        currentTime.setHours(0, 0, 0, 0);
      }

      // Hours between start and capped end
      const totalSeconds = Math.floor((currentTime.getTime() - sessionStartTime.getTime()) / 1000);
      let totalHours = totalSeconds / 3600;
      if (totalHours > 24) totalHours = 24;

      // User name for the log
      const userSession = localStorage.getItem('user_session');
      const userData = userSession ? JSON.parse(userSession) : {};
      const employeeName = userData.fullName || userData.name || 'Employee';

      // Create time log
      const newLog: TimeLog = {
        id: Date.now().toString(),
        employee: employeeName,
        date: sessionStartTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        startTime: sessionStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        endTime: currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        break: 0,
        totalHours,
        status: 'Pending'
      };

      // Save via API + update local stream
      this.addLog(newLog);

      // Clear session
      localStorage.removeItem('timerSession');
    } catch (error) {
    }
  }
}
