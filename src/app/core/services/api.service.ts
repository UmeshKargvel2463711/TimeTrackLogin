import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  // Use relative URLs - requests will be proxied via proxy.conf.json
  // The proxy handles the SSL certificate issue with the self-signed backend cert
  private apiUrl = '/api';

  // All endpoints use real backend API - no mock data
  private useMockForTasks = false;
  private useMockForTimeLogs = false;
  private useMockForUsers = false;

  /**
   * Get HTTP headers with authorization token
   */
  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (isPlatformBrowser(this.platformId)) {
      // Try multiple token storage locations
      let token = localStorage.getItem('token');

      // Fallback: check if token is in user_session
      if (!token) {
        try {
          const userSession = localStorage.getItem('user_session');
          if (userSession) {
            const user = JSON.parse(userSession);
            token = user.token || user.accessToken || user.jwtToken;
          }
        } catch (e) {
          // Silently fail - token not found in session
        }
      }

      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return headers;
  }

  /**
   * Handle API errors
   */
  private handleError(error: any): Observable<any> {
    return of(null);
  }

  // ==================== USER ENDPOINTS ====================

  /**
   * Get all users
   * Backend endpoint: GET /api/User/all
   */
  getUsers(): Observable<any[]> {
    if (this.useMockForUsers) {
      return of([]); // Return empty - will be populated by service from localStorage
    }

    // Only fetch in browser (SSR has certificate issues with self-signed certs)
    if (!isPlatformBrowser(this.platformId)) {
      return of([]);
    }

    return this.http.get<any>(`${this.apiUrl}/User/all`, { headers: this.getHeaders() })
      .pipe(
        map((response: any) => {

          // Handle different response formats from backend
          let users: any[] = [];
          if (Array.isArray(response)) {
            users = response;
          } else if (response && Array.isArray(response.$values)) {
            users = response.$values;
          } else if (response && Array.isArray(response.data)) {
            users = response.data;
          } else if (response && Array.isArray(response.result)) {
            users = response.result;
          }

          // Filter out null/undefined users - check both id and userId
          users = users.filter(u => u != null && (u.id != null || u.userId != null));
          return users;
        }),
        catchError(err => {
          return of([]);
        })
      );
  }
  /**
   * Get current user profile
   * Backend endpoint: GET /api/User/profile
   */
  getUserProfile(): Observable<any> {
    if (!isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    return this.http.get<any>(`${this.apiUrl}/User/profile`, { headers: this.getHeaders() })
      .pipe(
        catchError(err => {
          return of(null);
        })
      );
  }

  /**
   * Get team members for the current manager
   * Backend endpoint: GET /api/User/my-team
   */
 getMyTeam(): Observable<any[]> {
  // For SSR safety
  if (!isPlatformBrowser(this.platformId)) return of([]);

  return this.http.get<any>(`${this.apiUrl}/User/my-team`, {
    headers: this.getHeaders()
  })
  .pipe(
    // Your backend wraps as { success, message, data, errors }
    map((res: any) => {
      const team = res?.data ?? res ?? [];
      return Array.isArray(team) ? team : [];
    }),
    tap(team => console.log('? getMyTeam ?', team)),
    catchError(err => {
      return of([]); // return empty so UI doesn�t break
    })
  );
}

  /**
   * Get users by department
   * Backend endpoint: GET /api/User/department/{department}
   */
  getUsersByDepartment(department: string): Observable<any[]> {
    if (this.useMockForUsers) {
      return of([]);
    }

    if (!isPlatformBrowser(this.platformId)) {
      return of([]);
    }

    return this.http.get<any[]>(`${this.apiUrl}/User/department/${encodeURIComponent(department)}`, { headers: this.getHeaders() })
      .pipe(
        catchError(err => {
          return of([]);
        })
      );
  }

  /**
   * Deactivate a user
   * Backend endpoint: PATCH /api/User/{userId}/deactivate
   */
  deactivateUser(userId: string): Observable<any> {
    if (this.useMockForUsers) {
      return of({ success: true });
    }

    return this.http.patch<any>(`${this.apiUrl}/User/${userId}/deactivate`, {}, { headers: this.getHeaders() })
      .pipe(
        catchError(err => {
          return of({ success: false });
        })
      );
  }

  /**
   * Activate a user
   * Backend endpoint: PATCH /api/User/{userId}/activate
   */
  activateUser(userId: string): Observable<any> {
    if (this.useMockForUsers) {
      return of({ success: true });
    }

    return this.http.patch<any>(`${this.apiUrl}/User/${userId}/activate`, {}, { headers: this.getHeaders() })
      .pipe(
        catchError(err => {
          return of({ success: false });
        })
      );
  }

  /**
   * Get user by ID
   * Backend endpoint: GET /api/User/:id
   */
  getUserById(id: string): Observable<any> {
    if (this.useMockForUsers) {
      return of(null);
    }
    return this.http.get<any>(`${this.apiUrl}/User/${id}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Get user by email
   * Backend endpoint: GET /api/User/email/:email
   */
  getUserByEmail(email: string): Observable<any> {
    if (this.useMockForUsers) {
      return of(null);
    }
    return this.http.get<any>(`${this.apiUrl}/User/email/${email}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Create new user
   * Backend endpoint: POST /api/User
   */
  createUser(user: any): Observable<any> {
    if (this.useMockForUsers) {
      return of({ ...user, id: `user_${Date.now()}` });
    }
    return this.http.post<any>(`${this.apiUrl}/User`, user, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Update user
   * Backend endpoint: PUT /api/User/:id
   * Always calls API - no mock data
   */
  updateUser(id: string, user: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/User/${id}`, user, { headers: this.getHeaders() })
      .pipe(
        map((response: any) => {
          return response.data || response;
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Delete user
   * Backend endpoint: DELETE /api/User/:id
   */
  deleteUser(id: string): Observable<any> {
    if (this.useMockForUsers) {
      return of({ success: true });
    }
    return this.http.delete<any>(`${this.apiUrl}/User/${id}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Get users by role
   * Backend endpoint: GET /api/User?role=Employee
   */
  getUsersByRole(role: string): Observable<any[]> {
    if (this.useMockForUsers) {
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/User?role=${role}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  // ==================== TIME LOG ENDPOINTS ====================

  /**
   * Get all time logs for current user
   * Backend endpoint: GET /api/TimeLog/user
   */
  getTimeLogs(startDate?: string, endDate?: string): Observable<any[]> {
    if (this.useMockForTimeLogs) {
      return of([]);
    }

    let url = `${this.apiUrl}/TimeLog/user`;
    const params: string[] = [];

    if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);

    if (params.length > 0) {
      url += '?' + params.join('&');
    }
    return this.http.get<any>(`${url}`, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        map((response: any) => {
          // Handle ApiResponseDto wrapper
          if (response?.data) {
            return Array.isArray(response.data) ? response.data : [response.data];
          }
          return Array.isArray(response) ? response : [];
        }),
        catchError(err => {
          return of([]);
        })
      );
  }

  /**
   * Get time logs for a specific employee
   * Backend endpoint: GET /api/TimeLog?employeeId=:id
   */
  getTimeLogsByEmployee(employeeId: string): Observable<any[]> {
    if (this.useMockForTimeLogs) {
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/TimeLog?employeeId=${employeeId}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Get time logs for a specific date
   * Backend endpoint: GET /api/TimeLog?date=:date
   */
  getTimeLogsByDate(date: string): Observable<any[]> {
    if (this.useMockForTimeLogs) {
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/TimeLog?date=${date}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Create time log
   * Backend endpoint: POST /api/TimeLog
   */
  createTimeLog(data: any): Observable<any> {
    if (this.useMockForTimeLogs) {
      return of({ ...data, id: `log_${Date.now()}` });
    }
    return this.http.post<any>(`${this.apiUrl}/TimeLog`, data, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        map((response: any) => {
          // Handle ApiResponseDto wrapper
          if (response?.data) {
            return response.data;
          }
          return response;
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Update time log
   * Backend endpoint: PUT /api/TimeLog/:id
   */
  updateTimeLog(id: string, data: any): Observable<any> {
    if (this.useMockForTimeLogs) {
      return of(data);
    }
    return this.http.put<any>(`${this.apiUrl}/TimeLog/${id}`, data, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        map((response: any) => {
          // Handle ApiResponseDto wrapper
          if (response?.data) {
            return response.data;
          }
          return response;
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  // ==================== TASK ENDPOINTS ====================

  /**
   * Get all tasks
   * Backend endpoint: GET /api/Task
   */
  getTasks(): Observable<any[]> {
    if (this.useMockForTasks) {
      // Return tasks from localStorage when using mock data (only on browser)
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const stored = localStorage.getItem('tasks');
          if (stored) {
            return of(JSON.parse(stored));
          }
        } catch (e) {
        }
      }
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/Task`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Get tasks assigned to a specific user
   * Backend endpoint: GET /api/Task?assignedTo=:userId
   */
  getTasksByAssignee(userId: string): Observable<any[]> {
    if (this.useMockForTasks) {
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/Task?assignedTo=${userId}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Get tasks created by the current manager
   * Backend endpoint: GET /api/Task/created-by-me
   */
  getTasksCreatedByMe(): Observable<any[]> {
    if (!isPlatformBrowser(this.platformId)) {
      return of([]);
    }
    return this.http.get<any[]>(`${this.apiUrl}/Task/created-by-me`, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        map((response: any) => {
          // Handle different response formats
          let tasks: any[] = [];
          if (Array.isArray(response)) {
            tasks = response;
          } else if (response && Array.isArray(response.$values)) {
            tasks = response.$values;
          } else if (response && Array.isArray(response.data)) {
            tasks = response.data;
          }
          // Convert date strings to Date objects
          return tasks.map(task => ({
            ...task,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            createdDate: task.createdDate ? new Date(task.createdDate) : null
          }));
        }),
        catchError(err => {
          return of([]);
        })
      );
  }

  /**
   * Get tasks assigned to the current user (employee)
   * Backend endpoint: GET /api/Task/my-tasks
   */
  getMyTasks(): Observable<any[]> {
    if (!isPlatformBrowser(this.platformId)) {
      return of([]);
    }

    return this.http.get<any>(`${this.apiUrl}/Task/my-tasks`, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        map((response: any) => {
          // Handle different response formats
          let tasks: any[] = [];
          if (Array.isArray(response)) {
            tasks = response;
          } else if (response && Array.isArray(response.$values)) {
            tasks = response.$values;
          } else if (response && Array.isArray(response.data)) {
            tasks = response.data;
          }
          // Convert date strings to Date objects
          return tasks.map(task => ({
            ...task,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            createdDate: task.createdDate ? new Date(task.createdDate) : null
          }));
        }),
        catchError(err => {
          return of([]);
        })
      );
  }

  /**
   * Create task
   * Backend endpoint: POST /api/Task
   */
  createTask(task: any): Observable<any> {
    if (this.useMockForTasks) {
      return of({ ...task, id: `task_${Date.now()}` });
    }
    return this.http.post<any>(`${this.apiUrl}/Task`, task, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Update task
   * Backend endpoint: PUT /api/Task/:id
   */
  updateTask(id: string, task: any): Observable<any> {
    if (this.useMockForTasks) {
      return of(task);
    }
    return this.http.put<any>(`${this.apiUrl}/Task/${id}`, task, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Delete task
   * Backend endpoint: DELETE /api/Task/:id
   */
  deleteTask(id: string): Observable<any> {
    if (this.useMockForTasks) {
      return of({ success: true });
    }
    return this.http.delete<any>(`${this.apiUrl}/Task/${id}`, { headers: this.getHeaders() })
      .pipe(catchError(err => this.handleError(err)));
  }

  /**
   * Start a task (change status to 'In Progress')
   * Backend endpoint: PATCH /api/Task/{id}/start
   */
  startTask(id: string): Observable<any> {
    if (this.useMockForTasks) {
      return of({ success: true, status: 'InProgress' });
    }
    const url = `${this.apiUrl}/Task/${id}/start`;

    return this.http.patch<any>(url, {}, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Complete a task (change status to 'Completed')
   * Backend endpoint: PATCH /api/Task/{id}/complete
   */
  completeTask(id: string, hoursSpent: number = 0, comments: string = ''): Observable<any> {
    if (this.useMockForTasks) {
      return of({ success: true, status: 'Completed' });
    }
    const url = `${this.apiUrl}/Task/${id}/complete`;

    return this.http.patch<any>(url, {}, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Approve a task completion (manager action)
   * Backend endpoint: PATCH /api/Task/{id}/approve
   */
  approveTaskCompletion(id: string, approvalComments: string = ''): Observable<any> {
    if (this.useMockForTasks) {
      return of({ success: true, status: 'Approved' });
    }
    const url = `${this.apiUrl}/Task/${id}/approve`;

    return this.http.patch<any>(url, {}, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Reject a task completion (manager action)
   * Backend endpoint: PATCH /api/Task/{id}/reject
   */
  rejectTask(id: string, reason: string): Observable<any> {
    const url = `${this.apiUrl}/Task/${id}/reject`;
    const payload = { reason };

    return this.http.patch<any>(url, payload, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Log time spent on a task
   * Backend endpoint: POST /api/Task/log-time
   */
  logTaskTime(dto: any): Observable<any> {
    const url = `${this.apiUrl}/Task/log-time`;

    return this.http.post<any>(url, dto, { headers: this.getHeaders() })
      .pipe(
        tap((response: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Get tasks pending approval (manager only)
   * Backend endpoint: GET /api/Task/pending-approval
   */
  getPendingApprovalTasks(): Observable<any> {
    const url = `${this.apiUrl}/Task/pending-approval`;

    return this.http.get<any>(url, { headers: this.getHeaders() })
      .pipe(
        map((response: any) => {
          // Extract tasks from response
          const tasks = Array.isArray(response) ? response :
            (response?.data || response?.$values || []);
          return tasks;
        }),
        tap((tasks: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  /**
   * Get overdue tasks (manager only)
   * Backend endpoint: GET /api/Task/overdue
   */
  getOverdueTasks(): Observable<any> {
    const url = `${this.apiUrl}/Task/overdue`;

    return this.http.get<any>(url, { headers: this.getHeaders() })
      .pipe(
        map((response: any) => {
          // Extract tasks from response
          const tasks = Array.isArray(response) ? response :
            (response?.data || response?.$values || []);
          return tasks;
        }),
        tap((tasks: any) => {
        }),
        catchError(err => {
          return this.handleError(err);
        })
      );
  }

  // ==================== REGISTRATION ENDPOINTS ====================
  // Note: Registration endpoints are now handled directly by RegistrationService
  // using /api/Registration endpoints

  // ==================== CONFIGURATION ====================

  /**
   * Get manager dashboard statistics
   * Backend endpoint: GET /api/Task/manager-stats?managerId={id}
   */
  getManagerStats(managerId: string): Observable<any> {
    if (!managerId) {
      return of(null);
    }

    const url = `${this.apiUrl}/Task/manager-stats?managerId=${encodeURIComponent(managerId)}`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(catchError(err => {
        return of(null);
      })
    );
  }

  /**
   * Get employee dashboard statistics
   * Backend endpoint: GET /api/Task/employee-stats?employeeId={id}
   */
  getEmployeeStats(employeeId: string): Observable<any> {
    if (!employeeId) {
      return of(null);
    }

    const url = `${this.apiUrl}/Task/employee-stats?employeeId=${encodeURIComponent(employeeId)}`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(catchError(err => {
        return of(null);
      })
    );
  }

  /**
   * Get time logs for a specific task
   * Backend endpoint: GET /api/Task/{taskId}/time-logs
   */
  getTaskTimeLogs(taskId: string): Observable<any> {
    const url = `${this.apiUrl}/Task/${taskId}/time-logs`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(catchError(err => {
        return of([]);
      })
    );
  }

  /**
   * Get tasks filtered by status
   * Backend endpoint: GET /api/Task?status={status}
   */
  getTasksByStatus(status: string): Observable<any> {
    const url = `${this.apiUrl}/Task?status=${status}`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(catchError(err => {
        return of([]);
      })
    );
  }

  /**
   * Get tasks filtered by assigned employee (manager only)
   * Backend endpoint: GET /api/Task?assignedToUserId={userId}
   */
  getTasksByEmployee(employeeId: string): Observable<any> {
    const url = `${this.apiUrl}/Task?assignedToUserId=${employeeId}`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(catchError(err => {
        return of([]);
      })
    );
  }


  // ==================== ORGANIZATION ANALYTICS ENDPOINTS ====================

  /**
   * Get organization-wide analytics summary
   * Backend endpoint: GET /api/Analytics/organization-summary
   */
  getOrganizationAnalytics(period: 7 | 14 | 30 | 90 = 7): Observable<any> {

    if (!isPlatformBrowser(this.platformId)) {
      return of({
        statusCode: 200,
        data: {
          totalHoursLogged: 0,
          avgHoursPerEmployee: 0,
          activeEmployees: 0,
          totalEmployees: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          pendingTasks: 0,
          taskCompletionPercentage: 0,
          employeeCount: 0,
          managerCount: 0,
          adminCount: 0,
          departmentMetrics: [],
          avgEmployeesPerDepartment: 0,
          hoursTrendData: [],
          reportGeneratedAt: new Date().toISOString(),
          periodRange: `Last ${period} days`
        }
      });
    }

    return this.http.get<any>(
      `${this.apiUrl}/Analytics/organization-summary`,
      {
        params: { period },
        headers: this.getHeaders()
      }
    ).pipe(
      tap((response: any) => {
      }),
      catchError((err: any) => {
        return this.handleError(err);
      })
    );
  }

  // ==================== CONFIGURATION ====================

  /**
   * Set API base URL (call this during app initialization)
   */
  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  /**
   * Toggle between mock data and real API for specific services
   */
  setUseMockForTasks(useMock: boolean): void {
    this.useMockForTasks = useMock;
  }

  setUseMockForTimeLogs(useMock: boolean): void {
    this.useMockForTimeLogs = useMock;
  }

  setUseMockForUsers(useMock: boolean): void {
    this.useMockForUsers = useMock;
  }

  /**
   * Get task completion breakdown by status
   * Backend endpoint: GET /api/Analytics/task-completion-breakdown
   */
  getTaskCompletionBreakdown(startDate?: string, endDate?: string): Observable<any> {

    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    if (!isPlatformBrowser(this.platformId)) {
      return of({
        success: true,
        data: {
          completedCount: 0,
          inProgressCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          overdueCount: 0,
          totalCount: 0,
          completionPercentage: 0
        }
      });
    }

    return this.http.get<any>(
      `${this.apiUrl}/Analytics/task-completion-breakdown`,
      {
        params,
        headers: this.getHeaders()
      }
    ).pipe(
      tap((response: any) => {
      }),
      catchError((err: any) => {
        return this.handleError(err);
      })
    );
  }

  /**
   * Get current API URL
   */
  getApiUrl(): string {
    return this.apiUrl;
  }
}


