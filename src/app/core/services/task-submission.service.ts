import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';
import { TaskSubmission, TaskService } from './task.service';

@Injectable({
    providedIn: 'root'
})
export class TaskSubmissionService {
    private apiService = inject(ApiService);
    private taskService = inject(TaskService);

    private initialSubmissions: TaskSubmission[] = [];

    private submissionsSubject = new BehaviorSubject<TaskSubmission[]>([]);
    submissions$ = this.submissionsSubject.asObservable();

    constructor() {
        this.loadSubmissions();
    }

    /**
     * Load submissions from localStorage
     */
    private loadSubmissionsFromStorage(): TaskSubmission[] {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('task_submissions');
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    return [];
                }
            }
        }
        return [];
    }

    /**
     * Save submissions to localStorage
     */
    private saveSubmissionsToStorage(submissions: TaskSubmission[]): void {
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.setItem('task_submissions', JSON.stringify(submissions));
            } catch (e) {
            }
        }
    }

    /**
     * Load submissions from API or fallback to localStorage
     */
    private loadSubmissions(): void {
        // Try to load from localStorage first for better UX
        const storedSubmissions = this.loadSubmissionsFromStorage();
        if (storedSubmissions.length > 0) {
            this.submissionsSubject.next(storedSubmissions);
        } else if (this.initialSubmissions.length > 0) {
            this.submissionsSubject.next(this.initialSubmissions);
        }
    }

    /**
     * Get all submissions
     */
    getSubmissions(): Observable<TaskSubmission[]> {
        return this.submissions$;
    }

    /**
     * Get submissions by employee
     */
    getSubmissionsByEmployee(employeeName: string): TaskSubmission[] {
        return this.submissionsSubject.value.filter(
            sub => sub.submittedBy.toLowerCase() === employeeName.toLowerCase()
        );
    }

    /**
     * Get pending submissions for manager approval
     */
    getPendingSubmissions(): TaskSubmission[] {
        return this.submissionsSubject.value.filter(
            sub => sub.approvalStatus === 'Pending'
        );
    }

    /**
     * Get submissions by status
     */
    getSubmissionsByStatus(status: string): TaskSubmission[] {
        return this.submissionsSubject.value.filter(
            sub => sub.approvalStatus === status
        );
    }

    /**
     * Submit task completion
     */
    submitTaskCompletion(submission: TaskSubmission) {
        submission.submittedDate = new Date();
        submission.id = submission.id || `submission_${Date.now()}`;
        submission.approvalStatus = 'Pending';

        // Save locally first
        const currentSubmissions = this.submissionsSubject.value;
        const updatedSubmissions = [submission, ...currentSubmissions];
        this.submissionsSubject.next(updatedSubmissions);
        this.saveSubmissionsToStorage(updatedSubmissions);
    }

    /**
     * Approve task submission
     */
    approveSubmission(submissionId: string, approverName: string, approvalComments?: string) {
        this.updateSubmissionStatus(submissionId, 'Approved', approverName, approvalComments);
        
        // Also update the task status to Completed
        const submission = this.getSubmissionById(submissionId);
        if (submission && submission.taskId) {
            this.taskService.updateTaskStatus(submission.taskId, 'Completed');
        }
    }

    /**
     * Reject task submission
     */
    rejectSubmission(submissionId: string, approverName: string, rejectionReason: string) {
        this.updateSubmissionStatus(submissionId, 'Rejected', approverName, rejectionReason);
    }

    /**
     * Mark submission as needs changes
     */
    needsChanges(submissionId: string, approverName: string, changeReason: string) {
        this.updateSubmissionStatus(submissionId, 'Need Changes', approverName, changeReason);
    }

    /**
     * Reassign task to different date
     */
    reassignTask(submissionId: string, approverName: string, newDate: string, comments?: string) {
        const currentSubmissions = this.submissionsSubject.value;
        const index = currentSubmissions.findIndex(sub => sub.id === submissionId);
        
        if (index !== -1) {
            const updatedSubmissions = [...currentSubmissions];
            updatedSubmissions[index] = {
                ...updatedSubmissions[index],
                reassignDate: newDate,
                approvalStatus: 'Approved',
                approvedBy: approverName,
                approvalDate: new Date(),
                approvalComments: comments || `Reassigned to ${newDate}`
            };
            
            this.submissionsSubject.next(updatedSubmissions);
            this.saveSubmissionsToStorage(updatedSubmissions);
        }
    }

    /**
     * Update submission status
     */
    private updateSubmissionStatus(
        submissionId: string,
        status: 'Approved' | 'Rejected' | 'Need Changes',
        approverName: string,
        comments?: string
    ) {
        const currentSubmissions = this.submissionsSubject.value;
        const index = currentSubmissions.findIndex(sub => sub.id === submissionId);
        
        if (index !== -1) {
            const updatedSubmissions = [...currentSubmissions];
            updatedSubmissions[index] = {
                ...updatedSubmissions[index],
                approvalStatus: status,
                approvedBy: approverName,
                approvalDate: new Date(),
                approvalComments: comments
            };
            
            this.submissionsSubject.next(updatedSubmissions);
            this.saveSubmissionsToStorage(updatedSubmissions);
        }
    }

    /**
     * Get submission by ID
     */
    getSubmissionById(id: string): TaskSubmission | undefined {
        return this.submissionsSubject.value.find(sub => sub.id === id);
    }

    /**
     * Get submissions for manager's team
     */
    getTeamSubmissions(teamMemberNames: string[]): TaskSubmission[] {
        return this.submissionsSubject.value.filter(
            sub => teamMemberNames.some(name => name.toLowerCase() === sub.submittedBy.toLowerCase())
        );
    }

    /**
     * Get submission count by status
     */
    getSubmissionCountByStatus(status: string): number {
        return this.submissionsSubject.value.filter(sub => sub.approvalStatus === status).length;
    }
}

