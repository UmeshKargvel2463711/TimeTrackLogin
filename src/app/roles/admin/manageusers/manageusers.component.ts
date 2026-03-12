import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';

interface User {
  id?: string;
  fullName: string;
  email: string;
  role: string;
  department?: string;
  status?: string;
  type?: string;
  phone?: string;
  joinDate?: string;
  managerId?: string;
  assignedEmployees?: string[];
}

@Component({
  selector: 'app-manageusers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manageusers.component.html',
  styleUrl: './manageusers.component.css'
})
export class ManageusersComponent implements OnInit {
  searchTerm: string = '';
  showEditModal: boolean = false;
  selectedUser: User | null = null;
  availableManagers: User[] = [];
  availableEmployees: User[] = [];

  // Roles and Departments
  roles: string[] = ['Employee', 'Manager'];
  departments: string[] = [
    'Dot-net Angular',
    'Java Angular',
    'Java React',
    'Multi cloud'
  ];

  // Filter properties
  roleFilter: string = '';
  deptFilter: string = '';

  allUsers: User[] = [];
  filteredUsers: User[] = [];

  constructor(private userService: UserService) {}

  ngOnInit() {
    // Subscribe to user changes - this will automatically update when users are refreshed
    this.userService.users$.subscribe((users: any[]) => {
      // Filter out null/undefined users from backend response
      const validUsers = users.filter(u => u != null && u.id != null);
      
      // Transform users from UserService format to display format
      this.allUsers = validUsers.map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName || u.email,
        role: u.role ? String(u.role).trim() : 'Employee',
        department: u.department || 'Development',
        status: u.status || 'Active',
        type: 'System',
        phone: u.phone,
        joinDate: u.joinDate,
        managerId: u.managerId,
        assignedEmployees: u.assignedEmployees || []
      }));
      this.applySearch();
    });
    
    // Initial refresh to get latest users from API
    this.userService.refreshUsers();
  }

  loadUsers() {
    // This method can now just trigger a refresh
    this.userService.refreshUsers();
  }

  // --- STAT GETTERS (Fixes NG5002 Error) ---
  get totalUsersCount(): number {
    return this.allUsers.length;
  }

  get activeUsersCount(): number {
    return this.allUsers.filter(u => u.status === 'Active').length;
  }

  get inactiveUsersCount(): number {
    return this.allUsers.filter(u => u.status === 'Inactive').length;
  }

  openEditModal(user: User) {
    this.selectedUser = { ...user };
    this.populateManagersAndEmployees();
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedUser = null;
    this.availableManagers = [];
    this.availableEmployees = [];
  }

  populateManagersAndEmployees() {
    if (!this.selectedUser) return;

    // Populate available managers (all managers except current user)
    this.availableManagers = this.allUsers
      .filter(u => u.role === 'Manager' && u.id !== this.selectedUser!.id);

    // Populate available employees (all employees except current user)
    this.availableEmployees = this.allUsers
      .filter(u => u.role === 'Employee' && u.id !== this.selectedUser!.id);
  }

  onEditRoleChange() {
    if (!this.selectedUser) return;

    if (this.selectedUser.role === 'Employee') {
      // Clear assignedEmployees if changing to employee
      this.selectedUser.assignedEmployees = [];
      this.availableEmployees = [];
    } else if (this.selectedUser.role === 'Manager') {
      // Clear managerId if changing to manager
      this.selectedUser.managerId = '';
      this.availableEmployees = this.allUsers
        .filter(u => u.role === 'Employee' && u.id !== this.selectedUser!.id);
    }
  }

  saveUserChanges() {
    if (!this.selectedUser || !this.selectedUser.id) {
      alert('Invalid user');
      return;
    }

    const originalUser = this.allUsers.find(u => u.id === this.selectedUser!.id);
    const oldRole = originalUser?.role || '';
    const newRole = this.selectedUser.role;
    const roleChanged = oldRole !== newRole;

    // Handle role change: Employee -> Manager (Upgrade)
    if (roleChanged && oldRole === 'Employee' && newRole === 'Manager') {
      this.userService.upgradeToManager(this.selectedUser.id);
      // Also update basic info
      this.userService.updateUser(this.selectedUser.id, {
        fullName: this.selectedUser.fullName,
        department: this.selectedUser.department,
        status: this.selectedUser.status as 'Active' | 'Inactive'
      });
    }
    // Handle role change: Manager -> Employee (Downgrade)
    else if (roleChanged && oldRole === 'Manager' && newRole === 'Employee') {
      this.userService.downgradeToEmployee(this.selectedUser.id);
      // Also update basic info and assign manager if selected
      if (this.selectedUser.managerId) {
        this.userService.assignManagerToEmployee(this.selectedUser.id, this.selectedUser.managerId, '');
      }
      this.userService.updateUser(this.selectedUser.id, {
        fullName: this.selectedUser.fullName,
        department: this.selectedUser.department,
        status: this.selectedUser.status as 'Active' | 'Inactive'
      });
    }
    else if (newRole === 'Employee') {
      const oldManagerId = originalUser?.managerId || '';
      const newManagerId = this.selectedUser.managerId || '';

      // Use UserService to handle the manager-employee relationship
      if (oldManagerId !== newManagerId) {
        this.userService.assignManagerToEmployee(this.selectedUser.id, newManagerId, oldManagerId);
      }
      // Also update basic user data
      this.userService.updateUser(this.selectedUser.id, {
        fullName: this.selectedUser.fullName,
        department: this.selectedUser.department,
        managerId: newManagerId
      });
    }
    // Handle Manager role (no role change or already Manager)
    else if (newRole === 'Manager') {
      const oldAssignedEmployees = originalUser?.assignedEmployees || [];
      const newAssignedEmployees = this.selectedUser.assignedEmployees || [];

      // Use UserService to handle the manager-employee relationships
      this.userService.assignEmployeesToManager(
        this.selectedUser.id, 
        newAssignedEmployees, 
        oldAssignedEmployees
      );
      
      // Also update basic user data
      this.userService.updateUser(this.selectedUser.id, {
        fullName: this.selectedUser.fullName,
        department: this.selectedUser.department
      });
    } else {
      // Other roles - just update basic data
      this.userService.updateUser(this.selectedUser.id, {
        fullName: this.selectedUser.fullName,
        role: this.selectedUser.role as 'Employee' | 'Manager' | 'Admin',
        department: this.selectedUser.department
      });
    }

    this.closeEditModal();
  }

  isEmployeeAssigned(employeeId?: string): boolean {
    if (!employeeId || !this.selectedUser) return false;
    return this.selectedUser.assignedEmployees?.includes(employeeId) || false;
  }

  toggleEmployeeAssignment(employeeId?: string) {
    if (!employeeId || !this.selectedUser) return;

    if (!this.selectedUser.assignedEmployees) {
      this.selectedUser.assignedEmployees = [];
    }

    const index = this.selectedUser.assignedEmployees.indexOf(employeeId);
    if (index > -1) {
      this.selectedUser.assignedEmployees.splice(index, 1);
    } else {
      this.selectedUser.assignedEmployees.push(employeeId);
    }

    this.selectedUser.assignedEmployees = [...this.selectedUser.assignedEmployees];
  }

  toggleStatus(user: User) {
    if (user.id) {
      const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
      this.userService.updateUser(user.id, { status: newStatus as 'Active' | 'Inactive' });
      this.loadUsers();
    }
  }

  /**
   * Get computed status for display (Active if timer running)
   */
  getDisplayStatus(user: User): 'Active' | 'Inactive' {
    // Cast to UserService User type for the service call
    const serviceUser = user as any;
    return this.userService.getComputedStatus(serviceUser);
  }

  deleteUser(email: string) {
    if (confirm('Are you sure you want to delete this user?')) {
      const user = this.allUsers.find(u => u.email === email);
      if (user && user.id) {
        this.userService.deleteUser(user.id);
        this.loadUsers();
      }
    }
  }

  // --- SEARCH ---
  applySearch() {
    const term = this.searchTerm.toLowerCase();
    this.filteredUsers = this.allUsers.filter(user => {
      // If search term exists, check if it matches any field
      const matchesSearch = !term || 
        user.fullName?.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term) ||
        user.department?.toLowerCase().includes(term);
      
      // Filter by role (if selected)
      const matchesRole = !this.roleFilter || user.role === this.roleFilter;
      
      // Filter by department (if selected)
      const matchesDept = !this.deptFilter || user.department === this.deptFilter;
      
      return matchesSearch && matchesRole && matchesDept;
    });
  }

  // --- MANAGER ASSIGNMENT HELPERS ---
  getManagerName(managerId?: string): string {
    if (!managerId) {
      return '';
    }
    console.log('👤 getManagerName - Available users:', this.allUsers.map(u => ({ id: u.id, fullName: u.fullName })));
    const manager = this.allUsers.find(u => u.id === managerId);
    return manager ? manager.fullName : '';
  }

  getAssignedEmployeeNames(employeeIds?: string[]): string {
    if (!employeeIds || employeeIds.length === 0) return '';
    return employeeIds
      .map(id => {
        const employee = this.allUsers.find(u => u.id === id);
        return employee ? employee.fullName : '';
      })
      .filter(name => name)
      .join(', ');
  }
}
