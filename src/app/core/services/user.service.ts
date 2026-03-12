// src/app/core/services/user.service.ts

import { Injectable, Inject, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { map, switchMap, catchError, finalize } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ApiService } from './api.service';
import { ApiResponse, UserDto, TeamMemberDto } from '../models/time-log.model';

export interface User {
  id?: string;
  email: string;
  password?: string;
  fullName: string;
  role: 'Employee' | 'Manager' | 'Admin';
  department?: string;
  phone?: string;
  joinDate?: string;
  status?: 'Active' | 'Inactive';
  createdDate?: Date;
  managerId?: string | null;
  assignedEmployees?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private platformId = inject(PLATFORM_ID);
  private apiService = inject(ApiService);
  private http = inject(HttpClient);

  private readonly baseUrl = '/api/user';

  private usersSubject = new BehaviorSubject<User[]>([]);
  users$ = this.usersSubject.asObservable();

  currentUserChanged = signal<User | null>(null);

  constructor() {
    this.loadUsers();
  }

  /**
   * Get user role from localStorage to determine API access
   */
  private getUserRoleFromStorage(): string {
    try {
      const userSession = localStorage.getItem('user_session');
      if (userSession) {
        const user = JSON.parse(userSession);
        return user?.role || 'Employee';
      }
    } catch (e) {
      console.warn('Failed to get user role from storage');
    }
    return 'Employee';
  }

  // ---------------------------
  // Auth Headers
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

  /** Get current user profile (GET /api/user/profile) */
  getProfile(): Observable<ApiResponse<UserDto>> {
    return this.http.get<ApiResponse<UserDto>>(
      `${this.baseUrl}/profile`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get my team members (GET /api/user/my-team) - Manager/Admin only */
  getMyTeam(): Observable<ApiResponse<TeamMemberDto[]>> {
    return this.http.get<ApiResponse<TeamMemberDto[]>>(
      `${this.baseUrl}/my-team`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get employees by manager ID (GET /api/user/{managerId}/employees) */
  getEmployeesByManager(managerId: string): Observable<ApiResponse<UserDto[]>> {
    return this.http.get<ApiResponse<UserDto[]>>(
      `${this.baseUrl}/${managerId}/employees`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get manager dashboard stats (GET /api/user/manager-dashboard/{managerId}) */
  getManagerDashboard(managerId: string): Observable<any> {
    return this.http.get(
      `${this.baseUrl}/manager-dashboard/${managerId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /** Get all users (GET /api/user/all) - Manager/Admin only */
  getAllUsers(): Observable<ApiResponse<UserDto[]>> {
    return this.http.get<ApiResponse<UserDto[]>>(
      `${this.baseUrl}/all`,
      { headers: this.getAuthHeaders() }
    );
  }

  // ---------------------------
  // Data Loading & Refresh
  // ---------------------------

  private loadUsers(): void {
    // Only fetch users if current user is Admin or Manager
    // Employees can't access /api/User/all and will get 403 Forbidden
    const userRole = this.getUserRoleFromStorage();
    if (userRole !== 'Admin' && userRole !== 'Manager') {
      // For employees, just load from cache
      this.loadUsersFromStorage();
      return;
    }

    this.apiService.getUsers().subscribe({
      next: (response: any) => {
        // Normalize various possible backend response shapes
        let users: any[] = [];
        if (Array.isArray(response)) {
          users = response;
        } else if (response && Array.isArray(response.$values)) {
          users = response.$values; // Some .NET serializers
        } else if (response && Array.isArray(response.data)) {
          users = response.data;
        } else if (response && Array.isArray(response.result)) {
          users = response.result;
        }

        // Map backend model -> frontend model
        const mapped: User[] = users.map((u: any) => ({
          id: (u.userId ?? u.id)?.toString(),                       // GUID string
          email: u.email,
          fullName: u.name || u.fullName || u.email,
          role: (u.role as 'Employee' | 'Manager' | 'Admin') ?? 'Employee',
          department: u.department,
          status: u.status || 'Active',
          phone: u.phone,
          joinDate: u.joinDate || u.createdAt,
          managerId: u.managerId ? String(u.managerId) : null,
          assignedEmployees: Array.isArray(u.assignedEmployeeIds)
            ? u.assignedEmployeeIds.map((id: any) => String(id))
            : []
        }));

        this.usersSubject.next(mapped);
        this.saveUsersToStorage(mapped);
        //
      },
      error: (err) => {
        this.loadUsersFromStorage();
      }
    });
  }

  /** Public refresh trigger */
  refreshUsers(): void {
    //
    this.loadUsers();
  }

  // ---------------------------
  // Queries / Getters
  // ---------------------------

  getUsers(): Observable<User[]> {
    return this.users$;
  }

  getTeamMembers(managerId: string): Observable<User[]> {
    return this.users$.pipe(
      map(users => users.filter(u => u.role === 'Employee' && u.managerId === managerId))
    );
  }

  getUserById(id: string): User | undefined {
    return this.usersSubject.value.find(u => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    const key = email.toLowerCase();
    return this.usersSubject.value.find(u => u.email.toLowerCase() === key);
  }

  getUsersByRole(role: string): User[] {
    return this.usersSubject.value.filter(u => u.role === role);
  }

  getUsersByDepartment(department: string): User[] {
    return this.usersSubject.value.filter(u => u.department === department);
  }

  getActiveUsers(): User[] {
    return this.usersSubject.value.filter(u => u.status === 'Active');
  }

  // ---------------------------
  // Mutations (CRUD)
  // ---------------------------

  /** Create user via API (fallback to local if API fails) */
  addUser(user: User) {
    const current = this.usersSubject.value;

    // Enforce simple local uniqueness by email
    const emailKey = user.email.toLowerCase();
    const existingIdx = current.findIndex(u => u.email.toLowerCase() === emailKey);

    if (existingIdx !== -1) {
      this.updateUser(current[existingIdx].id!, user);
      return;
    }

    // Ensure defaults
    user.status = user.status ?? 'Active';
    user.createdDate = user.createdDate ?? new Date();

    this.apiService.createUser(user).subscribe({
      next: (created: any) => {
        // Created may return the new record; re-map if needed
        this.refreshUsers();
      },
      error: (err) => {
        const newUsers = [...current, user];
        this.usersSubject.next(newUsers);
        this.saveUsersToStorage(newUsers);
      }
    });
  }

  /**
   * Update an existing user.
   * IMPORTANT: we send GUID strings (or null) for relationships—no parseInt.
   */
  updateUser(id: string, updatedUser: Partial<User>) {
    const dto = {
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      department: updatedUser.department,
      status: updatedUser.status,
      // GUID string or null clears manager
      managerId: updatedUser.managerId ?? null,
      // Array of GUID strings for employees
      assignedEmployeeIds: updatedUser.assignedEmployees ?? []
    };

    //

    this.apiService.updateUser(id, dto).subscribe({
      next: () => this.refreshUsers(),
      error: (err) => console.error('❌ Update failed:', err)
    });
  }

  /** Internal helper to update without auto-refresh; lets us batch changes and refresh once */
  private updateUserRaw(id: string, updatedUser: Partial<User>) {
    const dto = {
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      department: updatedUser.department,
      status: updatedUser.status,
      managerId: updatedUser.managerId ?? null,
      assignedEmployeeIds: updatedUser.assignedEmployees ?? []
    };
    return this.apiService.updateUser(id, dto).pipe(
      catchError(err => {
        return of(null);
      })
    );
  }

  /** Deactivate user (PATCH) */
  deactivateUser(id: string) {
    this.apiService.deactivateUser(id).subscribe({
      next: () => this.updateUser(id, { status: 'Inactive' }),
      error: (err) => {
        // Fallback: still mark as inactive locally
        this.updateUser(id, { status: 'Inactive' });
      }
    });
  }

  /** Activate user (PATCH) */
  activateUser(id: string) {
    this.apiService.activateUser(id).subscribe({
      next: () => this.updateUser(id, { status: 'Active' }),
      error: (err) => {
        // Fallback: still mark as active locally
        this.updateUser(id, { status: 'Active' });
      }
    });
  }

  /**
   * Delete a user
   * Calls the API endpoint to delete the user from the database
   */
  deleteUser(id: string) {
    this.apiService.deleteUser(id).subscribe({
      next: () => {
        console.log('✅ User deleted successfully');
        this.refreshUsers();
      },
      error: (err) => {
        console.error('❌ Delete failed:', err);
        alert('Failed to delete user. Please try again.');
      }
    });
  }

  // ---------------------------
  // Manager ↔ Employee assignments
  // ---------------------------

  /**
   * Assign (or reassign) a manager to an employee and maintain both sides.
   * - Set employee.managerId = managerId (or null to unassign)
   * - Remove employee from oldManager.assignedEmployees
   * - Add employee to newManager.assignedEmployees
   */
  assignManagerToEmployee(employeeId: string, managerId: string | null, oldManagerId?: string | null) {
    const ops = [];

    // 1) Update employee's manager
    ops.push(this.updateUserRaw(employeeId, { managerId }));

    // 2) Remove from old manager
    if (oldManagerId && oldManagerId !== managerId) {
      const oldManager = this.getUserById(oldManagerId);
      if (oldManager?.assignedEmployees) {
        const updatedList = oldManager.assignedEmployees.filter(id => id !== employeeId);
        ops.push(this.updateUserRaw(oldManagerId, { assignedEmployees: updatedList }));
      }
    }

    // 3) Add to new manager
    if (managerId) {
      const newManager = this.getUserById(managerId);
      const currentList = newManager?.assignedEmployees ?? [];
      if (!currentList.includes(employeeId)) {
        ops.push(this.updateUserRaw(managerId, { assignedEmployees: [...currentList, employeeId] }));
      }
    }

    if (ops.length === 0) return;

    forkJoin(ops).pipe(finalize(() => this.refreshUsers())).subscribe();
  }

  /**
   * Overwrite the list of employees assigned to a manager and reflect on each employee.
   * - Set manager.assignedEmployees = newEmployeeIds
   * - For newly added employees → set employee.managerId = managerId
   * - For removed employees → set employee.managerId = null
   */
  assignEmployeesToManager(managerId: string, newEmployeeIds: string[], oldEmployeeIds: string[]) {
    const ops = [];

    // 1) Update manager list
    ops.push(this.updateUserRaw(managerId, { assignedEmployees: newEmployeeIds }));

    // 2) New assignments → ensure employee.managerId = managerId
    newEmployeeIds.forEach(empId => {
      const emp = this.getUserById(empId);
      if (!emp || emp.managerId !== managerId) {
        ops.push(this.updateUserRaw(empId, { managerId }));
      }
    });

    // 3) Removed employees → clear managerId
    oldEmployeeIds.forEach(empId => {
      if (!newEmployeeIds.includes(empId)) {
        ops.push(this.updateUserRaw(empId, { managerId: null }));
      }
    });

    forkJoin(ops).pipe(finalize(() => this.refreshUsers())).subscribe();
  }

  /**
   * Upgrade Employee → Manager
   * - Clear managerId
   * - Clear assignedEmployees
   * - Remove from old manager's assignedEmployees list
   */
  upgradeToManager(userId: string) {
    const user = this.getUserById(userId);
    if (!user) return;

    const ops = [];

    const oldManagerId = user.managerId ?? null;

    // Make the user a Manager and clear relationships
    ops.push(this.updateUserRaw(userId, {
      role: 'Manager',
      managerId: null,
      assignedEmployees: []
    }));

    // Remove from old manager
    if (oldManagerId) {
      const oldManager = this.getUserById(oldManagerId);
      if (oldManager?.assignedEmployees) {
        const updatedList = oldManager.assignedEmployees.filter(id => id !== userId);
        ops.push(this.updateUserRaw(oldManagerId, { assignedEmployees: updatedList }));
      }
    }

    forkJoin(ops).pipe(finalize(() => this.refreshUsers())).subscribe();
  }

  /**
   * Downgrade Manager → Employee
   * - Clear managerId of all assigned employees
   * - Clear manager.assignedEmployees
   * - Set user.role = 'Employee'
   */
  downgradeToEmployee(userId: string) {
    const user = this.getUserById(userId);
    if (!user) return;

    const ops = [];

    const assigned = user.assignedEmployees ?? [];

    // Clear manager on every assigned employee
    assigned.forEach(empId => {
      ops.push(this.updateUserRaw(empId, { managerId: null }));
    });

    // Downgrade the manager
    ops.push(this.updateUserRaw(userId, {
      role: 'Employee',
      assignedEmployees: [],
      managerId: null
    }));

    forkJoin(ops).pipe(finalize(() => this.refreshUsers())).subscribe();
  }

  // ---------------------------
  // Local Storage helpers
  // ---------------------------

  private saveUsersToStorage(users: User[]) {
    if (!isPlatformBrowser(this.platformId)) return;

    const deduped = this.deduplicateUsers(users);
    localStorage.setItem('users', JSON.stringify(deduped));
  }

  private loadUsersFromStorage() {
    if (!isPlatformBrowser(this.platformId)) {
      this.usersSubject.next([]);
      return;
    }

    const saved = localStorage.getItem('users');
    if (!saved) {
      this.usersSubject.next([]);
      return;
    }

    try {
      let users: User[] = JSON.parse(saved);
      users = this.migrateUsersToFullName(users);
      users = this.deduplicateUsers(users);

      // Filter out dummy emails if needed
      const dummyEmails = new Set([
        'akash@gmail.com', 'chandana@gmail.com', 'prachothan@gmail.com',
        'gopi@gmail.com', 'umesh@gmail.com', 'john.doe@example.com',
        'jane.doe@example.com', 'test@test.com'
      ]);
      users = users.filter(u => !dummyEmails.has(u.email?.toLowerCase()));

      this.usersSubject.next(users);
      this.saveUsersToStorage(users); // persist migrated/deduped
    } catch (e) {
      this.usersSubject.next([]);
    }
  }

  private migrateUsersToFullName(users: User[]): User[] {
    return users.map(u => {
      if (u.fullName) return u;
      const anyUser = u as any;
      const firstName = anyUser.firstName || '';
      const lastName = anyUser.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim();
      return { ...u, fullName: fullName || u.email };
    });
  }

  private deduplicateUsers(users: User[]): User[] {
    const seen = new Map<string, User>();
    users.forEach(u => {
      const key = u.email.toLowerCase();
      if (!seen.has(key)) seen.set(key, u);
    });
    return Array.from(seen.values());
  }

  // ---------------------------
  // Status derived from local timer session (optional)
  // ---------------------------

  hasActiveTimerSession(userId: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const timerSession = localStorage.getItem('timerSession');
      const userSession = localStorage.getItem('user_session');
      if (timerSession && userSession) {
        const user = JSON.parse(userSession);
        return user.id === userId;
      }
    } catch (err) {
    }
    return false;
  }

  getComputedStatus(user: User): 'Active' | 'Inactive' {
    if (this.hasActiveTimerSession(user.id || '')) {
      return 'Active';
    }
    return user.status || 'Inactive';
  }
}
