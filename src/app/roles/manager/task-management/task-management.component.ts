import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ManagerDataService } from '../../../core/services/manager-data.service';
import { UserService } from '../../../core/services/user.service';
import { TaskSubmissionService } from '../../../core/services/task-submission.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { TaskSubmission, TaskService } from '../../../core/services/task.service';
import { Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';

interface TeamMember {
  userId: string;
  name: string;
}

@Component({
  selector: 'app-task-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-management.component.html',
  styleUrls: ['./task-management.component.css']
})
export class TaskManagementComponent implements OnInit, OnDestroy {
  private dataService = inject(ManagerDataService);
  private submissionService = inject(TaskSubmissionService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private taskService = inject(TaskService);
  private destroy$ = new Subject<void>();

  isSubmitting = false;
  editingTaskId: number | null = null;

  showModal = false;
  showApprovalModal = false;
  showEditModal = false;
  showViewModal = false;  // For task history view
  showTimeLogsModal = false;  // For time logs view
  tasks: any[] = [];
  pendingApprovalTasks: any[] = [];
  teamMembers: TeamMember[] = [];
  taskSubmissions: TaskSubmission[] = [];
  currentManagerName: string = '';
  activeTab: string = 'Manage Tasks';
  taskTimeLogs: any[] = [];  // Time logs for selected task

  // Filter properties
  selectedStatusFilter: string = 'All';
  selectedMemberFilter: string = 'All';

  selectedSubmission: TaskSubmission | null = null;
  selectedTask: any = null;
  viewTask: any = null;  // Task being viewed in history modal
  approvalForm = {
    status: 'Approved' as 'Approved' | 'Rejected' | 'Need Changes',
    comments: '',
    reassignDate: ''
  };

  newTask = {
    title: '',
    description: '',
    assignedTo: '',
    hours: 8,
    status: 'Pending',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    dueDate: ''
  };

  editTask = {
    title: '',
    description: '',
    assignedTo: '',
    hours: 8,
    status: 'Pending',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    dueDate: ''
  };

  ngOnInit() {
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.currentManagerName = currentUser.fullName;
    }

    // Get current manager ID from session
    const currentManagerId = this.getCurrentManagerId();

    // Load team members from API
    this.apiService.getMyTeam().pipe(takeUntil(this.destroy$)).subscribe({
      next: (members: any[]) => {
        this.teamMembers = members.map(m => ({
          userId: m.userId || m.id,
          name: m.name || m.fullName
        }));

        // Set default assignee to first team member's userId
        if (this.teamMembers.length > 0 && !this.newTask.assignedTo) {
          this.newTask.assignedTo = this.teamMembers[0].userId;
        }
      },
      error: (err) => {
      }
    });

    // Load tasks created by this manager from API
    // DISABLED: Causes 403 Forbidden on page load. Backend requires proper authentication.
    // Tasks will be loaded from dataService.tasks$ subscription below or manually via refresh button.
    // this.loadTasksFromApi();

    // Subscribe to tasks and dynamically update when they change
    this.dataService.tasks$.pipe(takeUntil(this.destroy$)).subscribe((data: any[]) => {
      this.tasks = data;
    });

    // Subscribe to task submissions
    this.submissionService.getSubmissions().pipe(takeUntil(this.destroy$)).subscribe((submissions: TaskSubmission[]) => {
      const teamMemberNames = this.teamMembers.map(m => m.name);
      this.taskSubmissions = this.submissionService.getTeamSubmissions(teamMemberNames);
    });

    // Periodically refresh submissions to ensure we get latest updates
    setInterval(() => {
      const teamMemberNames = this.teamMembers.map(m => m.name);
      this.taskSubmissions = this.submissionService.getTeamSubmissions(teamMemberNames);
    }, 5000); // Refresh every 5 seconds
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get filtered tasks based on status and team member selection
   * Uses backend API filtering when available
   */
  get filteredTasks(): any[] {
    let filtered = [...this.tasks];

    // Filter by status if not 'All'
    if (this.selectedStatusFilter !== 'All') {
      filtered = filtered.filter(task => {
        // Handle different status formats
        const taskStatus = task.status || '';
        const filterStatus = this.selectedStatusFilter;

        // Normalize comparison
        if (filterStatus === 'InProgress') {
          return taskStatus === 'InProgress' || taskStatus === 'In Progress';
        }
        return taskStatus === filterStatus;
      });
    }

    // Filter by team member if not 'All'
    if (this.selectedMemberFilter !== 'All') {
      filtered = filtered.filter(task => {
        const assignedUserId = task.assignedToUserId || task.userId || '';
        return assignedUserId === this.selectedMemberFilter;
      });
    }

    return filtered;
  }

  /**
   * Reset filters to show all tasks
   */
  resetFilters(): void {
    this.selectedStatusFilter = 'All';
    this.selectedMemberFilter = 'All';
    this.loadTasksFromApi();
  }

  /**
   * Filter tasks by status using backend API
   */
  filterByStatus(status: string): void {
    this.selectedStatusFilter = status;
    if (status === 'All') {
      this.loadTasksFromApi();
    } else {
      this.apiService.getTasksByStatus(status).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: any) => {
          const tasks = response?.data || response || [];
          this.tasks = tasks;
        },
        error: (err) => {
        }
      });
    }
  }

  /**
   * Filter tasks by assigned employee using backend API
   */
  filterByEmployee(employeeId: string): void {
    this.selectedMemberFilter = employeeId;
    if (employeeId === 'All') {
      this.loadTasksFromApi();
    } else {
      this.apiService.getTasksByEmployee(employeeId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: any) => {
          const tasks = response?.data || response || [];
          this.tasks = tasks;
        },
        error: (err) => {
        }
      });
    }
  }

  /**
   * Get current manager ID from session
   */
  private getCurrentManagerId(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('user_session');
      if (saved) {
        const user = JSON.parse(saved);
        return user.id || '';
      }
    }
    return '';
  }

  /**
   * Load tasks created by this manager from API
   * NOTE: Only call this manually (e.g., via refresh button) to avoid 403 errors on page load
   */
  private loadTasksFromApi(): void {
    this.apiService.getTasksCreatedByMe().pipe(takeUntil(this.destroy$)).subscribe({
      next: (tasks: any[]) => {
        this.tasks = tasks;
        // Update dataService so other components get the data
        if (tasks && tasks.length > 0) {
          // Store in localStorage for future use
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('manager_tasks', JSON.stringify(tasks));
          }
        }
      },
      error: (err) => {
        // Try to load from localStorage as fallback
        if (typeof window !== 'undefined' && window.localStorage) {
          const stored = localStorage.getItem('manager_tasks');
          if (stored) {
            try {
              this.tasks = JSON.parse(stored);
            } catch (e) {
            }
          }
        }
      }
    });
  }

  /**
   * Refresh tasks list from API
   */
  refreshTasks(): void {
    this.loadTasksFromApi();
  }

  /**
   * Refresh submissions list from service
   */
  refreshSubmissions(): void {
    const teamMemberNames = this.teamMembers.map(m => m.name);
    this.taskSubmissions = this.submissionService.getTeamSubmissions(teamMemberNames);
    this.notificationService.success('Submissions refreshed');
  }

  /**
   * Submit task to API
   * Sends assignedToUserId and estimatedHours to POST /api/Task
   */
  submitTask(): void {
    // Validate form
    if (!this.newTask.title.trim()) {
      this.notificationService.error('Please enter a task title');
      return;
    }

    // If no assignee selected, auto-assign to first team member
    if (!this.newTask.assignedTo && this.teamMembers.length > 0) {
      this.newTask.assignedTo = this.teamMembers[0].userId;
    }

    if (!this.newTask.assignedTo) {
      this.notificationService.error('Please select a team member to assign the task');
      return;
    }

    this.isSubmitting = true;

    // Build payload with AssignedToUserId and estimatedHours
    const payload = {
      title: this.newTask.title,
      description: this.newTask.description,
      AssignedToUserId: this.newTask.assignedTo,
      estimatedHours: Number(this.newTask.hours),
      status: this.newTask.status,
      priority: this.newTask.priority,
      dueDate: this.newTask.dueDate ? new Date(this.newTask.dueDate).toISOString() : null
    };

    this.apiService.createTask(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.isSubmitting = false;

        // Show success notification
        this.notificationService.success('Task created successfully');

        // Close modal and reset form
        this.showModal = false;
        this.resetForm();

        // Refresh task list from API
        this.loadTasksFromApi();
      },
      error: (err: any) => {
        this.isSubmitting = false;

        // Extract error message
        const errorMessage = err?.error?.message || err?.error?.title || err?.error?.detail || 'Failed to create task';
        this.notificationService.error(errorMessage);
      }
    });
  }

  /**
   * Add new task with auto-assignment (calls submitTask)
   */
  addTask(): void {
    this.submitTask();
  }

  /**
   * Delete task with confirmation - calls DELETE /api/Task/{id}
   */
  deleteTask(task: any) {
    const taskId = task.taskId || task.id;
    this.onDeleteTask(taskId);
  }

  /**
   * Delete task by ID with SweetAlert confirmation dialog
   */
  async onDeleteTask(id: any): Promise<void> {
    // Validate ID exists
    if (!id && id !== 0) {
      this.notificationService.error('Cannot delete task: ID is missing');
      return;
    }

    // Find task details for confirmation
    const task = this.tasks.find(t => (t.taskId || t.id) === id);
    const taskTitle = task?.title || 'this task';
    const taskDisplayId = task?.displayTaskId || 'N/A';

    // Check if task is approved - cannot delete approved tasks
    if (task?.status === 'Approved' || task?.status === 'Completed') {
      await Swal.fire({
        title: 'Cannot Delete Task',
        html: `
          <div style=\"text-align: left;\">
            <p><strong>Task ${taskDisplayId}:</strong> ${taskTitle}</p>
            <p class=\"text-danger\" style=\"margin-top: 15px;\">
              <i class=\"fas fa-lock\"></i> 
              This task cannot be deleted because it has been <strong>${task.status}</strong>.
            </p>
            <p style=\"margin-top: 10px; font-size: 0.9rem;\">
              Only <strong>Pending</strong> or <strong>In Progress</strong> tasks can be deleted.
            </p>
          </div>
        `,
        icon: 'error',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc3545',
      });
      return;
    }

    // Show SweetAlert2 confirmation for deletable tasks
    const result = await Swal.fire({
      title: 'Delete Task?',
      html: `
        <div style=\"text-align: left;\">
          <p><strong>Task ${taskDisplayId}:</strong> ${taskTitle}</p>
          <p class=\"text-danger\" style=\"margin-top: 15px;\">
            <i class=\"fas fa-exclamation-triangle\"></i> 
            This action cannot be undone. The task will be permanently deleted.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
    });

    if (!result.isConfirmed) {
      return;
    }

    this.taskService.deleteTaskById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {

          // Remove from all local arrays
          this.tasks = this.tasks.filter(t => (t.taskId || t.id) !== id);
          this.pendingApprovalTasks = this.pendingApprovalTasks.filter(t => (t.taskId || t.id) !== id);


          this.notificationService.success('Task deleted successfully');
          this.loadTasksFromApi();
        },
        error: (err: any) => {
          const errorMessage = err?.error?.message || err?.error?.title || err?.error?.detail || 'Failed to delete task';
          this.notificationService.error(errorMessage);
        }
      });
  }

  /**
   * Open edit modal for a task (onEditTask)
   * Syncs database data with form controls
   */
  openEditModal(task: any) {

    this.selectedTask = task;
    // Use taskId (database ID) for editing
    this.editingTaskId = task.taskId || task.id;

    // Map task properties to form, handling null values
    this.editTask = {
      title: task.title || '',
      description: task.description || '',
      // Use assignedToUserId from API, fallback to assignedTo
      assignedTo: task.assignedToUserId || task.assignedTo || '',
      // Use estimatedHours from API, fallback to hours
      hours: task.estimatedHours ?? task.hours ?? 8,
      status: task.status || 'Pending',
      priority: task.priority || 'Medium',
      // Handle date formatting - ensure proper format for input[type=date]
      dueDate: this.formatDateForInput(task.dueDate)
    };
    this.showEditModal = true;
  }

  /**
   * Open view modal for task history (Approved tab)
   */
  openViewModal(task: any) {
    this.viewTask = task;

    // Load time logs to display employee work descriptions
    this.apiService.getTaskTimeLogs(task.taskId).subscribe({
      next: (response) => {
        const logs = response?.data || response || [];
        this.viewTask.timeLogs = logs;
        this.showViewModal = true;
      },
      error: (err) => {
        // Still show modal even if logs fail
        this.viewTask.timeLogs = [];
        this.showViewModal = true;
      }
    });
  }

  /**
   * Close view modal
   */
  closeViewModal() {
    this.showViewModal = false;
    this.viewTask = null;
  }

  /**
   * Format date for HTML date input
   */
  private formatDateForInput(date: any): string {
    if (!date) return '';

    try {
      if (typeof date === 'string') {
        // If ISO string, extract date part
        return date.split('T')[0];
      } else if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
    }
    return '';
  }

  /**
   * Alias for openEditModal
   */
  onEditTask(task: any): void {
    this.openEditModal(task);
  }

  /**
   * Close edit modal
   */
  closeEditModal() {
    this.showEditModal = false;
    this.selectedTask = null;
    this.editingTaskId = null;
    this.resetEditForm();
  }

  /**
   * Save edited task - calls PUT /api/Task/{id}
   */
  saveEditTask() {
    // Validate editingTaskId
    if (!this.editingTaskId && this.editingTaskId !== 0) {
      this.notificationService.error('Cannot update task: Task ID is missing');
      return;
    }

    if (!this.editTask.title.trim()) {
      this.notificationService.error('Please enter a task title');
      return;
    }

    this.isSubmitting = true;

    // Build payload matching API expectations
    // Handle null values properly (e.g., ProjectId can be null)
    const updatedTask = {
      title: this.editTask.title,
      description: this.editTask.description || null,
      AssignedToUserId: this.editTask.assignedTo || null,
      estimatedHours: this.editTask.hours ? Number(this.editTask.hours) : null,
      status: this.editTask.status,
      priority: this.editTask.priority,
      dueDate: this.editTask.dueDate ? new Date(this.editTask.dueDate).toISOString() : null
    };

    // Log form values before PUT call for debugging
    console.log('Form values being sent:', JSON.stringify(updatedTask, null, 2));

    this.taskService.updateTaskById(this.editingTaskId, updatedTask)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.isSubmitting = false;
          this.notificationService.success('Task updated successfully');
          this.closeEditModal();
          this.loadTasksFromApi();
        },
        error: (err: any) => {
          this.isSubmitting = false;
          const errorMessage = err?.error?.message || err?.error?.title || err?.error?.detail || 'Failed to update task';
          this.notificationService.error(errorMessage);
        }
      });
  }

  /**
   * Reset edit form
   */
  private resetEditForm() {
    this.editTask = {
      title: '',
      description: '',
      assignedTo: '',
      hours: 8,
      status: 'Pending',
      priority: 'Medium',
      dueDate: ''
    };
  }

  /**
   * Open approval modal for a submission
   */
  openApprovalModal(submission: TaskSubmission) {
    this.selectedSubmission = submission;
    this.approvalForm = {
      status: 'Approved',
      comments: '',
      reassignDate: submission.reassignDate || ''
    };
    this.showApprovalModal = true;
  }

  /**
   * Close approval modal
   */
  closeApprovalModal() {
    this.showApprovalModal = false;
    this.selectedSubmission = null;
    this.approvalForm = {
      status: 'Approved',
      comments: '',
      reassignDate: ''
    };
  }

  /**
   * Process task submission approval
   */
  processSubmission() {
    if (!this.selectedSubmission || !this.selectedSubmission.id) {
      this.notificationService.error('Invalid submission');
      return;
    }

    const submissionId = this.selectedSubmission.id;
    const taskTitle = this.selectedSubmission.taskTitle;

    switch (this.approvalForm.status) {
      case 'Approved':
        this.approveTaskCompletion(this.selectedSubmission);
        this.notificationService.success(`✅ Task "${taskTitle}" has been approved!`);
        break;

      case 'Rejected':
        this.submissionService.rejectSubmission(
          submissionId,
          this.currentManagerName,
          this.approvalForm.comments
        );
        this.notificationService.success(`❌ Task "${taskTitle}" has been rejected.`);
        break;

      case 'Need Changes':
        this.submissionService.needsChanges(
          submissionId,
          this.currentManagerName,
          this.approvalForm.comments
        );
        this.notificationService.success(`⚠️ Requested changes for task "${taskTitle}".`);
        break;
    }

    this.closeApprovalModal();
    this.loadTasksFromApi();
  }

  /**
   * Approve task completion (manager action)
   * Calls PATCH /api/Task/{id}/approve
   */
  approveTaskCompletion(submission: TaskSubmission) {
    if (!submission.taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    this.isSubmitting = true;
    const taskId = submission.taskId;
    const approvalComments = this.approvalForm.comments;

    this.taskService.approveTaskCompletion(taskId, approvalComments)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {

          // Approve submission in service
          this.submissionService.approveSubmission(
            submission.id!,
            this.currentManagerName,
            approvalComments
          );

          // Reload tasks from API to ensure sync
          this.loadTasksFromApi();

          this.notificationService.success('✅ Task completion approved!');
          this.isSubmitting = false;
        },
        error: (err: any) => {
          const message = err.error?.message || err.error || 'Failed to approve task';
          this.notificationService.error(message);
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Reject task (manager action)
   * Calls PATCH /api/Task/{id}/reject with reason
   */
  rejectTaskCompletion(taskId: string, reason: string) {
    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    if (!reason || !reason.trim()) {
      this.notificationService.error('Please provide a reason for rejection');
      return;
    }

    this.isSubmitting = true;

    this.taskService.rejectTask(taskId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {

          // Remove from pendingApprovalTasks immediately for instant UI update
          this.pendingApprovalTasks = this.pendingApprovalTasks.filter(t => (t.taskId || t.id) !== taskId);

          // Reload tasks from API to ensure sync
          this.loadTasksFromApi();

          this.notificationService.success('❌ Task rejected and sent back to In Progress');
          this.isSubmitting = false;
        },
        error: (err: any) => {
          const message = err.error?.message || err.error || 'Failed to reject task';
          this.notificationService.error(message);
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Approve task directly (from task list, not submission)
   * Calls PATCH /api/Task/{id}/approve
   */
  approveTask(task: any) {
    const taskId = task.taskId || task.id;
    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    // Check if task is in Completed status
    if (task.status !== 'Completed') {
      this.notificationService.error('Only completed tasks can be approved');
      return;
    }

    this.isSubmitting = true;

    this.taskService.approveTaskCompletion(taskId, '')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {

          // Remove from pendingApprovalTasks immediately for instant UI update
          this.pendingApprovalTasks = this.pendingApprovalTasks.filter(t => (t.taskId || t.id) !== taskId);

          // Reload tasks from API to ensure sync
          this.loadTasksFromApi();

          this.notificationService.success('✅ Task approved!');
          this.isSubmitting = false;
        },
        error: (err: any) => {
          const message = err.error?.message || err.error || 'Failed to approve task';
          this.notificationService.error(message);
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Reject task directly (from task list)
   * Calls PATCH /api/Task/{id}/reject with reason
   */
  async rejectTask(task: any) {
    const taskId = task.taskId || task.id;
    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    // Check if task is in Completed status
    if (task.status !== 'Completed') {
      this.notificationService.error('Only completed tasks can be rejected');
      return;
    }

    // Show SweetAlert2 popup for rejection reason
    const result = await Swal.fire({
      title: 'Reject Task',
      html: `
        <div style="text-align: left;">
          <p><strong>Task:</strong> ${task.title}</p>
          <p><strong>Employee:</strong> ${task.assignedToUserName}</p>
          <p class="text-muted" style="margin-top: 15px;">Please provide a detailed reason for rejection:</p>
        </div>
      `,
      input: 'textarea',
      inputPlaceholder: 'Enter rejection reason (e.g., incomplete work, quality issues, missing requirements...).',
      inputAttributes: {
        'aria-label': 'Rejection reason',
        'style': 'min-height: 100px;'
      },
      showCancelButton: true,
      confirmButtonText: 'Reject Task',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return 'Please provide a reason for rejection';
        }
        if (value.trim().length < 10) {
          return 'Reason must be at least 10 characters';
        }
        return null;
      }
    });

    if (result.isConfirmed && result.value) {
      this.rejectTaskCompletion(taskId, result.value.trim());
    }
  }

  /**
   * Load pending approval tasks
   * Calls GET /api/Task/pending-approval
   */
  loadPendingApprovalTasks() {

    this.taskService.getPendingApprovalTasks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks: any[]) => {

          // API now returns enriched tasks array directly
          this.pendingApprovalTasks = Array.isArray(tasks) ? tasks : [];

          this.notificationService.success(`Found ${this.pendingApprovalTasks.length} tasks awaiting approval`);
        },
        error: (err: any) => {
          const message = err.error?.message || 'Failed to load pending approval tasks';
          this.notificationService.error(message);
        }
      });
  }

  /**
   * Get task submission comments for a specific task
   */
  getTaskSubmissionComments(taskId: string): string {
    const submission = this.taskSubmissions.find(s => s.taskId === taskId);
    return submission?.comments || '';
  }

  /**
   * Get priority badge class
   */
  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'High':
        return 'badge-danger';
      case 'Medium':
        return 'badge-warning';
      case 'Low':
        return 'badge-success';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Get submission status class
   */
  getStatusClass(status: string): string {
    switch (status) {
      case 'Approved':
        return 'badge-success';
      case 'Rejected':
        return 'badge-danger';
      case 'Need Changes':
        return 'badge-warning';
      case 'Pending':
        return 'badge-info';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Get completion status class
   */
  getCompletionStatusClass(status: string): string {
    switch (status) {
      case 'Completed':
        return 'badge-success';
      case 'In Progress':
        return 'badge-warning';
      case 'Not Started':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Count tasks by status
   */
  getCount(status: string) {
    if (status === 'In Progress' || status === 'InProgress') {
      return this.tasks.filter(t => t.status === 'InProgress' || t.status === 'In Progress').length;
    }
    return this.tasks.filter(t => t.status === status).length;
  }

  /**
   * Get pending submissions count
   */
  getPendingSubmissionsCount(): number {
    return this.taskSubmissions.filter(s => s.approvalStatus === 'Pending').length;
  }

  /**
   * Reassign task to different date
   */
  reassignTaskDate() {
    if (!this.selectedSubmission || !this.selectedSubmission.id) {
      this.notificationService.error('Invalid submission');
      return;
    }

    if (!this.approvalForm.reassignDate) {
      this.notificationService.error('Please select a new date');
      return;
    }

    this.submissionService.reassignTask(
      this.selectedSubmission.id,
      this.currentManagerName,
      this.approvalForm.reassignDate,
      this.approvalForm.comments
    );
    this.notificationService.success('Task reassigned to new date');
    this.closeApprovalModal();
  }

  /**
   * Reset form to default values
   */
  resetForm() {
    this.newTask = {
      title: '',
      description: '',
      assignedTo: '',
      hours: 8,
      status: 'Pending',
      priority: 'Medium',
      dueDate: ''
    };
  }

  /**
   * Open time logs modal for a task
   */
  openTimeLogsModal(task: any): void {
    this.selectedTask = task;
    this.apiService.getTaskTimeLogs(task.taskId).subscribe({
      next: (response) => {
        const logs = response?.data || response || [];
        this.taskTimeLogs = logs;
        this.showTimeLogsModal = true;
      },
      error: (err) => {
        this.notificationService.error('Failed to load time logs');
      }
    });
  }

  /**
   * Close time logs modal
   */
  closeTimeLogsModal(): void {
    this.showTimeLogsModal = false;
    this.taskTimeLogs = [];
    this.selectedTask = null;
  }

  /**
   * Get total hours from time logs
   */
  getTotalHoursFromLogs(): number {
    return this.taskTimeLogs.reduce((sum, log) => sum + (log.hoursSpent || 0), 0);
  }
}
