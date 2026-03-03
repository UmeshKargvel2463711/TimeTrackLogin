import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService, Task, TaskSubmission } from '../../../core/services/task.service';
import { TaskSubmissionService } from '../../../core/services/task-submission.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { Subject, takeUntil } from 'rxjs';

interface TaskDisplay {
  id?: string;
  taskId?: string;
  name: string;
  description: string;
  status: string;
  currentHours: number;
  totalHours: number;
  progress: number;
  icon: string;
  statusClass: string;
  iconClass: string;
  priority: string;
  dueDate?: string;
  assignedDate?: Date;
}

@Component({
  selector: 'app-tasksassigned',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tasksassigned.component.html',
  styleUrls: ['./tasksassigned.component.css']
})
export class TasksComponent implements OnInit, OnDestroy {
  // Inject services
  private taskService = inject(TaskService);
  private taskSubmissionService = inject(TaskSubmissionService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private destroy$ = new Subject<void>();

  activeTab: string = 'My Tasks';
  isLoadingTasks = false;
  assignedTasks: any[] = [];
  stats = [
    { label: 'Pending', value: '0 tasks', icon: 'fa-regular fa-circle', class: 'icon-gray' },
    { label: 'In Progress', value: '0 tasks', icon: 'fa-regular fa-clock', class: 'icon-blue' },
    { label: 'Completed', value: '0 tasks', icon: 'fa-regular fa-circle-check', class: 'icon-green' }
  ];

  taskList: TaskDisplay[] = [];
  submissionHistory: TaskSubmission[] = [];

  // Modal and form properties
  showSubmissionModal = false;
  showLogTimeModal = false;
  selectedTask: TaskDisplay | null = null;
  selectedRawTask: any = null;
  isSubmitting = false;
  submissionForm = {
    completionStatus: 'Completed' as 'Completed' | 'In Progress' | 'Not Started',
    hoursSpent: 0,
    comments: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High'
  };
  logTimeForm = {
    hoursSpent: 0,
    date: new Date().toISOString().split('T')[0],
    workDescription: ''
  };

  currentUser: string = '';

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) {
      this.currentUser = user.fullName;
    }
    this.loadTasks();
    this.loadSubmissionHistory();

    // DISABLED: Backend endpoint causes 400 Bad Request errors
    // The /api/Task/employee-stats endpoint either doesn't exist or requires different parameters
    // Stats are calculated from local tasks data via updateStats() method instead
    // this.loadEmployeeStats();

    // Subscribe to task submission updates to get real-time approval/rejection status
    this.taskSubmissionService.getSubmissions().pipe(takeUntil(this.destroy$)).subscribe((submissions: TaskSubmission[]) => {

      // Check if any task status has changed based on submission approval
      submissions.forEach(submission => {
        // Find the task in assignedTasks
        const taskIndex = this.assignedTasks.findIndex(t => (t.taskId === submission.taskId || t.id === submission.taskId));

        if (taskIndex !== -1) {
          // Update task status based on submission approval status
          if (submission.approvalStatus === 'Approved') {
            if (this.assignedTasks[taskIndex].status !== 'Approved') {
              this.assignedTasks[taskIndex].status = 'Approved';
              this.assignedTasks[taskIndex].isRejected = false;
              this.assignedTasks[taskIndex].approvalComments = submission.approvalComments;
              this.notificationService.success(`✅ Task "${submission.taskTitle}" has been approved by ${submission.approvedBy}`);
              this.updateStatsFromAssignedTasks();
              // Stats updated from local task data, no API call needed
              // this.loadEmployeeStats();
            }
          } else if (submission.approvalStatus === 'Rejected') {
            const currentStatus = this.assignedTasks[taskIndex].status;
            // Mark task as rejected for Approvals tab display
            this.assignedTasks[taskIndex].isRejected = true;
            this.assignedTasks[taskIndex].rejectionReason = submission.approvalComments || 'No reason provided';

            // Change status back to InProgress so it appears in My Tasks tab
            if (currentStatus !== 'InProgress' && currentStatus !== 'In Progress') {
              this.assignedTasks[taskIndex].status = 'InProgress';
              this.notificationService.error(`Task "${submission.taskTitle}" was rejected. Reason: ${submission.approvalComments || 'No reason provided'}`);
              this.updateStatsFromAssignedTasks();
            }
          }
        }
      });
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load tasks from API using /api/Task/my-tasks endpoint
   */
  private loadTasks() {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return;
    }

    this.isLoadingTasks = true;

    // Use taskService.getMyTasks() which calls /api/Task/my-tasks
    this.taskService.getMyTasks().pipe(takeUntil(this.destroy$)).subscribe({
      next: (tasks: any[]) => {

        // Store raw tasks from API
        this.assignedTasks = tasks;

        // Transform to display format
        this.taskList = tasks.map(task => ({
          id: task.id,
          taskId: task.taskId || task.displayTaskId,
          name: task.title,
          description: task.description || '',
          status: task.status || 'Pending',
          currentHours: this.getProgressHours(task.status, task.estimatedHours || task.hours || 0),
          totalHours: task.estimatedHours || task.hours || 0,
          progress: this.getProgressPercentage(task.status),
          icon: this.getStatusIcon(task.status),
          statusClass: this.getStatusClass(task.status),
          iconClass: this.getIconClass(task.status),
          priority: task.priority || 'Medium',
          dueDate: task.dueDate,
          assignedDate: task.createdDate
        }));

        // Update statistics
        this.updateStatsFromAssignedTasks();
        // Stats calculated from local task data, no API call needed
        // this.loadEmployeeStats();
        this.isLoadingTasks = false;
      },
      error: (err) => {
        this.notificationService.error('Failed to load tasks');
        this.isLoadingTasks = false;
      }
    });
  }

  /**
   * Update statistics based on assigned tasks
   */
  private updateStatsFromAssignedTasks() {
    const pendingCount = this.assignedTasks.filter(t => t.status === 'Pending').length;
    const inProgressCount = this.assignedTasks.filter(t => t.status === 'InProgress' || t.status === 'In Progress').length;
    const completedCount = this.assignedTasks.filter(t => t.status === 'Completed' || t.status === 'Approved').length;

    this.stats = [
      { label: 'Pending', value: `${pendingCount} tasks`, icon: 'fa-regular fa-circle', class: 'icon-gray' },
      { label: 'In Progress', value: `${inProgressCount} tasks`, icon: 'fa-regular fa-clock', class: 'icon-blue' },
      { label: 'Completed', value: `${completedCount} tasks`, icon: 'fa-regular fa-circle-check', class: 'icon-green' }
    ];
  }

  /**
   * Load submission history for current employee
   */
  private loadSubmissionHistory() {
    this.taskSubmissionService.getSubmissions().pipe(takeUntil(this.destroy$)).subscribe(
      (submissions: TaskSubmission[]) => {
        this.submissionHistory = this.taskSubmissionService.getSubmissionsByEmployee(this.currentUser);
      }
    );
  }

  /**
   * Load employee dashboard statistics from new API endpoint
   */
  private loadEmployeeStats(): void {
    const employeeId = this.getCurrentEmployeeId();
    if (!employeeId) {
      return;
    }

    this.apiService.getEmployeeStats(employeeId).subscribe({
      next: (response) => {
        if (response && response.success && response.data) {
          const stats = response.data;
          // Update stats display - Completed count includes both Completed and Approved tasks
          const completedCount = (stats.completedTasks || 0) + (stats.approvedTasks || 0);
          this.stats = [
            { label: 'Pending', value: `${stats.pendingTasks} tasks`, icon: 'fa-regular fa-circle', class: 'icon-gray' },
            { label: 'In Progress', value: `${stats.inProgressTasks} tasks`, icon: 'fa-regular fa-clock', class: 'icon-blue' },
            { label: 'Completed', value: `${completedCount} tasks`, icon: 'fa-regular fa-circle-check', class: 'icon-green' }
          ];
        }
      },
      error: (err) => {
        // Fall back to counting from assignedTasks
        this.updateStatsFromAssignedTasks();
      }
    });
  }

  /**
   * Get active tasks (exclude Completed and Approved) for My Tasks tab
   * Includes rejected tasks that are back in InProgress status
   */
  getMyActiveTasks(): any[] {
    return this.assignedTasks.filter(task => {
      const status = task.status;
      // Show Pending and InProgress tasks
      // Don't show Completed, Approved tasks
      return (status === 'Pending' || status === 'InProgress' || status === 'In Progress') &&
        status !== 'Completed' &&
        status !== 'Approved';
    });
  }

  /**
   * Get tasks pending approval (Completed status only)
   */
  getPendingApprovalTasks(): any[] {
    return this.assignedTasks.filter(task => task.status === 'Completed');
  }

  /**
   * Get all approval-related tasks (Completed, Approved, and recently rejected)
   * For Approvals tab - shows approval history and status
   */
  getApprovalTasks(): any[] {
    return this.assignedTasks.filter(task =>
      task.status === 'Completed' ||
      task.status === 'Approved' ||
      task.isRejected === true
    );
  }

  /**
   * Open task submission modal
   */
  openSubmissionModal(task: TaskDisplay) {
    this.selectedTask = task;
    this.submissionForm = {
      completionStatus: 'Completed',
      hoursSpent: task.totalHours,
      comments: '',
      priority: task.priority as 'Low' | 'Medium' | 'High'
    };
    this.showSubmissionModal = true;
  }

  /**
   * Open submission modal from raw task object (from API)
   */
  openSubmissionModalFromTask(task: any) {
    // Convert raw API task to TaskDisplay format
    const taskDisplay: TaskDisplay = {
      id: task.id,
      taskId: task.displayTaskId || task.taskId,
      name: task.title,
      description: task.description || '',
      status: task.status || 'Pending',
      currentHours: this.getProgressHours(task.status, task.estimatedHours || 0),
      totalHours: task.estimatedHours || task.hours || 0,
      progress: this.getProgressPercentage(task.status),
      icon: this.getStatusIcon(task.status),
      statusClass: this.getStatusClass(task.status),
      iconClass: this.getIconClass(task.status),
      priority: task.priority || 'Medium',
      dueDate: task.dueDate
    };
    this.openSubmissionModal(taskDisplay);
  }

  /**
   * Open completion modal from raw task object
   */
  openCompletionModalFromTask(task: any) {
    this.selectedRawTask = task;
    // Convert raw API task to TaskDisplay format
    const taskDisplay: TaskDisplay = {
      id: task.id,
      taskId: task.displayTaskId || task.taskId,
      name: task.title,
      description: task.description || '',
      status: task.status || 'In Progress',
      currentHours: this.getProgressHours(task.status, task.estimatedHours || 0),
      totalHours: task.estimatedHours || task.hours || 0,
      progress: this.getProgressPercentage(task.status),
      icon: this.getStatusIcon(task.status),
      statusClass: this.getStatusClass(task.status),
      iconClass: this.getIconClass(task.status),
      priority: task.priority || 'Medium',
      dueDate: task.dueDate
    };
    this.selectedTask = taskDisplay;
    this.submissionForm = {
      completionStatus: 'Completed',
      hoursSpent: task.estimatedHours || 0,
      comments: '',
      priority: task.priority as 'Low' | 'Medium' | 'High'
    };
    this.showSubmissionModal = true;
  }

  /**
   * Start a task (change status from Pending to In Progress)
   */
  onStartTask(task: any) {
    // Try to get ID from various possible fields
    const taskId = task.id || task.taskId || task.displayTaskId;

    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    this.isSubmitting = true;

    // Optimistically update local state
    const index = this.assignedTasks.findIndex(t => (t.id || t.taskId || t.displayTaskId) === taskId);
    if (index !== -1) {
      this.assignedTasks[index].status = 'InProgress';
      this.assignedTasks[index].canComplete = true;
      this.assignedTasks[index].canStart = false;
      this.updateStatsFromAssignedTasks();
    }

    this.taskService.startTask(taskId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {

        // Update task with response data if available
        if (index !== -1 && response?.data) {
          const updatedTask = response.data;
          this.assignedTasks[index] = {
            ...this.assignedTasks[index],
            ...updatedTask,
            status: updatedTask.status || 'InProgress',
            canComplete: updatedTask.canComplete !== undefined ? updatedTask.canComplete : true,
            canStart: updatedTask.canStart !== undefined ? updatedTask.canStart : false,
            startedDate: updatedTask.startedDate || new Date().toISOString()
          };
          this.updateStatsFromAssignedTasks();
        }

        this.notificationService.success(`✨ Task started! Status changed to "In Progress"`);
        this.isSubmitting = false;
      },
      error: (err: any) => {

        // Revert optimistic update on error
        if (index !== -1) {
          this.assignedTasks[index].status = 'Pending';
          this.assignedTasks[index].canComplete = false;
          this.assignedTasks[index].canStart = true;
          this.updateStatsFromAssignedTasks();
        }

        const message = err.error?.message || err.error || 'Failed to start task';
        this.notificationService.error(message);
        this.isSubmitting = false;
      }
    });
  }

  /**
   * Complete a task (change status from In Progress to Completed)
   */
  onCompleteTask() {
    // Try to get ID from various possible fields
    const taskId = this.selectedRawTask?.id || this.selectedRawTask?.taskId || this.selectedRawTask?.displayTaskId;

    if (!taskId) {
      this.notificationService.error('Invalid task');
      this.closeModal();
      return;
    }

    if (this.submissionForm.hoursSpent <= 0) {
      this.notificationService.error('Hours spent must be greater than 0');
      return;
    }

    this.isSubmitting = true;
    const hoursSpent = this.submissionForm.hoursSpent;
    const comments = this.submissionForm.comments;

    // Optimistically update local state
    const index = this.assignedTasks.findIndex(t => (t.id || t.taskId || t.displayTaskId) === taskId);
    if (index !== -1) {
      this.assignedTasks[index].status = 'Completed';
      this.updateStatsFromAssignedTasks();
    }

    this.taskService.completeTask(taskId, hoursSpent, comments).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {

        // Create a submission record for manager approval
        const taskTitle = this.selectedRawTask?.title || 'Task';
        const submission: TaskSubmission = {
          taskId: taskId,
          taskTitle: taskTitle,
          submittedBy: this.currentUser,
          submittedDate: new Date(),
          completionStatus: 'Completed',
          hoursSpent: hoursSpent,
          comments: comments,
          approvalStatus: 'Pending',
          priority: this.selectedRawTask?.priority || 'Medium'
        };

        // Submit the completion to task submission service
        this.taskSubmissionService.submitTaskCompletion(submission);

        this.notificationService.success(`✅ Task completed! Awaiting manager approval.`);
        // Stats will update automatically from task data
        // this.loadEmployeeStats();
        this.closeModal();
        this.isSubmitting = false;
      },
      error: (err: any) => {

        // Revert optimistic update on error
        if (index !== -1) {
          this.assignedTasks[index].status = 'In Progress';
          this.updateStatsFromAssignedTasks();
        }

        const message = err.error?.message || err.error || 'Failed to complete task';
        this.notificationService.error(message);
        this.isSubmitting = false;
      }
    });
  }

  /**
   * Close modal
   */
  closeModal() {
    this.showSubmissionModal = false;
    this.selectedTask = null;
    this.submissionForm = {
      completionStatus: 'Completed',
      hoursSpent: 0,
      comments: '',
      priority: 'Medium'
    };
  }

  /**
   * Open log time modal
   */
  openLogTimeModal(task: any) {
    const taskId = task.id || task.taskId || task.displayTaskId;

    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    this.selectedRawTask = task;
    this.logTimeForm = {
      hoursSpent: 0,
      date: new Date().toISOString().split('T')[0],
      workDescription: ''
    };
    this.showLogTimeModal = true;
  }

  /**
   * Close log time modal
   */
  closeLogTimeModal() {
    this.showLogTimeModal = false;
    this.selectedRawTask = null;
    this.logTimeForm = {
      hoursSpent: 0,
      date: new Date().toISOString().split('T')[0],
      workDescription: ''
    };
  }

  /**
   * Submit logged time
   * Calls POST /api/Task/log-time
   */
  submitLogTime() {
    const taskId = this.selectedRawTask?.id || this.selectedRawTask?.taskId || this.selectedRawTask?.displayTaskId;

    if (!taskId) {
      this.notificationService.error('Invalid task ID');
      return;
    }

    if (this.logTimeForm.hoursSpent <= 0 || this.logTimeForm.hoursSpent > 24) {
      this.notificationService.error('Hours spent must be between 0.1 and 24');
      return;
    }

    if (!this.logTimeForm.workDescription.trim()) {
      this.notificationService.error('Please describe the work done');
      return;
    }

    this.isSubmitting = true;

    const logTimeDto = {
      taskId: taskId,
      hoursSpent: this.logTimeForm.hoursSpent,
      date: new Date(this.logTimeForm.date).toISOString(),
      workDescription: this.logTimeForm.workDescription
    };

    this.taskService.logTaskTime(logTimeDto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.notificationService.success(`⏰ Logged ${this.logTimeForm.hoursSpent} hours on task`);
          this.closeLogTimeModal();
          this.isSubmitting = false;

          // Reload tasks to get updated actualHours
          this.loadTasks();
        },
        error: (err: any) => {
          const message = err.error?.message || err.error || 'Failed to log time';
          this.notificationService.error(message);
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Submit task completion
   */
  submitTaskCompletion() {
    if (!this.selectedTask || !this.currentUser) {
      this.notificationService.error('Invalid task or user');
      return;
    }

    if (this.submissionForm.hoursSpent <= 0) {
      this.notificationService.error('Hours spent must be greater than 0');
      return;
    }

    const submission: TaskSubmission = {
      taskId: this.selectedTask.taskId || this.selectedTask.id!,
      taskTitle: this.selectedTask.name,
      submittedBy: this.currentUser,
      submittedDate: new Date(),
      completionStatus: this.submissionForm.completionStatus,
      hoursSpent: this.submissionForm.hoursSpent,
      comments: this.submissionForm.comments,
      approvalStatus: 'Pending',
      priority: this.submissionForm.priority
    };

    this.taskSubmissionService.submitTaskCompletion(submission);
    this.notificationService.success('Task submission sent to manager for approval');
    this.closeModal();
    this.loadSubmissionHistory();
  }

  /**
   * Get status badge color for submission
   */
  getSubmissionStatusClass(status: string): string {
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
   * Get completion status badge
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
   * Calculate progress hours based on status
   */
  private getProgressHours(status: string, totalHours: number): number {
    if (status === 'Completed') return totalHours;
    if (status === 'In Progress') return totalHours * 0.8;
    return 0;
  }

  /**
   * Get progress percentage based on status (public for template)
   */
  getProgressPercentage(status: string): number {
    if (status === 'Completed') return 100;
    if (status === 'In Progress') return 80;
    return 0;
  }

  /**
   * Get appropriate icon for status
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'Completed':
        return 'fa-regular fa-circle-check';
      case 'In Progress':
        return 'fa-regular fa-clock';
      default:
        return 'fa-solid fa-play';
    }
  }

  /**
   * Get CSS class for status badge
   */
  private getStatusClass(status: string): string {
    switch (status) {
      case 'Completed':
        return 'status-active';
      case 'In Progress':
        return 'badge-role manager';
      default:
        return 'badge-role employee';
    }
  }

  /**
   * Get CSS class for status icon
   */
  private getIconClass(status: string): string {
    switch (status) {
      case 'Completed':
        return 'icon-green';
      case 'In Progress':
        return 'icon-blue';
      default:
        return 'icon-gray';
    }
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
   * Update statistics based on tasks
   */
  private updateStats(tasks: Task[]) {
    const pendingCount = tasks.filter(t => t.status === 'Pending').length;
    const inProgressCount = tasks.filter(t => t.status === 'In Progress').length;
    const completedCount = tasks.filter(t => t.status === 'Completed').length;

    this.stats = [
      { label: 'Pending', value: `${pendingCount} tasks`, icon: 'fa-regular fa-circle', class: 'icon-gray' },
      { label: 'In Progress', value: `${inProgressCount} tasks`, icon: 'fa-regular fa-clock', class: 'icon-blue' },
      { label: 'Completed', value: `${completedCount} tasks`, icon: 'fa-regular fa-circle-check', class: 'icon-green' }
    ];
  }

  /**
   * Get current employee ID from user session
   */
  private getCurrentEmployeeId(): string | null {
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
}

