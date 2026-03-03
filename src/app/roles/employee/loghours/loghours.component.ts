import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { TimeLogService } from '../../../core/services/time-log.service';
import { BreakService } from '../../../core/services/break.service';
import { CreateTimeLogDto } from '../../../core/models/time-log.model';
import { CreateBreakDto, EndBreakDto, BreakDisplayModel } from '../../../core/models/break.model';

/**
 * BREAK TRACKING LIMITATION & DATABASE SCHEMA RECOMMENDATION:
 * 
 * Current Implementation:
 * - Individual break start/end times are only available during active sessions (in-memory)
 * - After page refresh, only activity names and cumulative breakDuration are restored from DB
 * - Active breaks can be resumed: if activity exists but totalHours is 0, break state is restored
 * - The breaks table shows total cumulative duration for all activities
 * 
 * Break Resume Logic:
 * - On page load/refresh, checks if there's an active session with activity but no endTime
 * - If detected, sets isOnBreak=true and restores the last activity from the activity list
 * - User can continue or end the break, updating the cumulative breakDuration
 * 
 * Recommended Database Schema Enhancement:
 * To preserve individual break details across sessions, add a separate Breaks table:
 * 
 * Table: Breaks
 *   - BreakId (PK, GUID)
 *   - TimeLogId (FK -> TimeLog.LogId)
 *   - Activity (string)
 *   - StartTime (TimeSpan or string HH:MM)
 *   - EndTime (TimeSpan or string HH:MM)
 *   - Duration (int, minutes)
 *   - CreatedAt (DateTime)
 * 
 * With this schema:
 *   - POST /api/Break on each "Start Break" action
 *   - PUT /api/Break/{id} on "End Break" to update EndTime and Duration
 *   - GET /api/TimeLog/{id}/breaks to retrieve all breaks for a time log
 *   - Breaks table would show actual start/end times even after refresh
 */

interface TimeLog {
  date: string;
  startTime: string;
  endTime: string;
  breakMin: number;
  totalHours: string;
  activity: string;
}

// Using BreakDisplayModel from break.model.ts

@Component({
  selector: 'app-log-hours',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './loghours.component.html',
  styleUrl: './loghours.component.css',
})
export class LogHoursComponent implements OnInit, OnDestroy {
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private timeLogService = inject(TimeLogService);
  private breakService = inject(BreakService);

  logs: TimeLog[] = [];
  breaks: BreakDisplayModel[] = [];

  // Statistics
  todayHours: number = 0;
  thisWeekHours: string = '0h 0m';
  daysLogged: number = 0;
  liveWorkHours: string = '0h 0m';

  // Static Display Variables
  selectedDate: string = '';
  maxDate: string = '';
  punchInTime: string = '--:-- --';
  punchOutTime: string = '--:-- --';
  cumulativeBreakDisplay: string = '0m';

  // State Variables
  isPunchedIn: boolean = false;
  isOnBreak: boolean = false;
  isPunchedOut: boolean = false;
  completedActivities: string[] = [];

  // Checkbox States
  punchInChecked: boolean = false;
  breakStartChecked: boolean = false;
  breakEndChecked: boolean = false;
  punchOutChecked: boolean = false;

  // Activity Selection
  selectedActivity: string = '';
  availableActivities: string[] = ['Morning Break', 'Lunch Break', 'Evening Break'];

  // Internal Storage
  private capturedPunchInTime: string = '';
  private capturedPunchOutTime: string = '';
  private capturedDate: string = '';
  private liveTimerInterval: any = null;
  private currentBreakStartTime: string = '';
  cumulativeBreakMinutes: number = 0;
  private currentLogId: string = ''; // Store the ID of the current time log
  private currentBreakId: string = ''; // Store the ID of the current break

  isSubmitting: boolean = false;

  ngOnInit() {
    const today = new Date();
    // Set selectedDate and maxDate in YYYY-MM-DD format
    this.selectedDate = today.toISOString().split('T')[0];
    this.maxDate = today.toISOString().split('T')[0];
    this.loadTimeLogs();
    // Resume active session and active break after logs are loaded
    setTimeout(() => {
      this.resumeActiveSession();
      this.resumeActiveBreak();
    }, 500);
  }

  ngOnDestroy() {
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
    }
  }

  /**
   * Single capture function for all actions (state-driven)
   */
  onCapture(): void {
    const now = new Date();
    const currentTime = this.formatTimeWithAMPM(now);
    const currentTime24h = now.toTimeString().substring(0, 5);

    // Punch In
    if (this.punchInChecked) {
      this.capturedDate = this.selectedDate;
      this.capturedPunchInTime = currentTime24h;
      this.punchInTime = currentTime;
      this.isPunchedIn = true;
      this.punchInChecked = false;
      this.startLiveTimer();
      
      // Create time log in database immediately using new API
      const dateObj = new Date(this.capturedDate);
      const isoDate = dateObj.toISOString();
      
      const createDto: CreateTimeLogDto = {
        date: isoDate,
        startTime: `${this.capturedPunchInTime}:00`, // HH:mm:ss format
        endTime: null, // Nullable for live sessions
        breakDuration: 0,
        totalHours: 0.0,
        activity: ''
      };
      
      console.log('📤 Sending Punch In payload:', JSON.stringify(createDto, null, 2));
      
      this.timeLogService.createTimeLog(createDto).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.currentLogId = response.data.logId;
            this.notificationService.success('Punched In - Timer started');
          } else {
            this.notificationService.error('Failed to create time log');
          }
        },
        error: (error: any) => {
          this.notificationService.error('Punched in locally, but failed to save to database');
        }
      });
      
      return;
    }

    // Start Break
    if (this.breakStartChecked) {
      if (!this.selectedActivity) {
        this.notificationService.error('Please select an activity first');
        this.breakStartChecked = false;
        return;
      }
      
      if (!this.currentLogId) {
        this.notificationService.error('Please punch in first');
        this.breakStartChecked = false;
        return;
      }
      
      this.currentBreakStartTime = currentTime24h;
      this.isOnBreak = true;
      this.breakStartChecked = false;
      
      // Create break record in database immediately
      const createBreakDto: CreateBreakDto = {
        timeLogId: this.currentLogId,
        activity: this.selectedActivity,
        startTime: `${currentTime24h}:00` // HH:mm:ss format
      };
      
      this.breakService.startBreak(createBreakDto).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.currentBreakId = response.data.breakId;
            
            // Add row to table with database-returned values
            this.breaks.push({
              breakId: response.data.breakId,
              activity: response.data.activity,
              startTime: this.convertToAMPM(response.data.startTime),
              endTime: '--:-- --',
              duration: '--'
            });
            this.notificationService.success('Break started');
          } else {
            this.notificationService.error('Failed to start break');
            this.isOnBreak = false;
          }
        },
        error: (error: any) => {
          
          // Handle backend error format
          let errorMessage = 'Failed to start break';
          if (error.error?.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
            errorMessage = error.error.errors.join(', ');
          } else if (error.error?.message) {
            errorMessage = error.error.message;
          }
          
          this.notificationService.error(errorMessage);
          this.isOnBreak = false;
        }
      });
      
      return;
    }

    // End Break
    if (this.breakEndChecked) {
      if (!this.isOnBreak || !this.currentBreakId) {
        this.notificationService.error('Please start a break first');
        this.breakEndChecked = false;
        return;
      }
      
      const breakEndTime = currentTime;
      const breakEndTime24h = currentTime24h;
      this.breakEndChecked = false;
      this.isOnBreak = false;
      
      // End break in database
      const endBreakDto: EndBreakDto = {
        endTime: `${breakEndTime24h}:00` // HH:mm:ss format
      };
      
      this.breakService.endBreak(this.currentBreakId, endBreakDto).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            // Update the break in UI table
            const breakIndex = this.breaks.findIndex(b => b.breakId === response.data!.breakId);
            if (breakIndex >= 0) {
              this.breaks[breakIndex].endTime = this.convertToAMPM(response.data.endTime!);
              this.breaks[breakIndex].duration = `${response.data.duration}m`;
              
              // Update cumulative break minutes
              this.cumulativeBreakMinutes += (response.data.duration || 0);
              this.updateCumulativeBreakDisplay();
            }
            
            // Mark activity as completed
            if (!this.completedActivities.includes(this.selectedActivity)) {
              this.completedActivities.push(this.selectedActivity);
            }
            this.notificationService.success('Break ended and logged');
            
            // Clear current break tracking
            this.currentBreakId = '';
            this.currentBreakStartTime = '';
            this.selectedActivity = '';
          } else {
            this.notificationService.error('Failed to end break');
            this.isOnBreak = true; // Restore break state
          }
        },
        error: (error: any) => {
          
          // Handle backend error format
          let errorMessage = 'Failed to end break';
          if (error.error?.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
            errorMessage = error.error.errors.join(', ');
          } else if (error.error?.message) {
            errorMessage = error.error.message;
          } else if (error.status === 400) {
            errorMessage = 'Invalid end time. Make sure end time is after start time.';
          }
          
          this.notificationService.error(errorMessage);
          this.isOnBreak = true; // Restore break state
        }
      });
      
      return;
    }

    // Punch Out
    if (this.punchOutChecked) {
      if (!this.isPunchedIn) {
        this.notificationService.error('Please punch in first');
        this.punchOutChecked = false;
        return;
      }
      if (this.isOnBreak) {
        this.notificationService.error('Cannot punch out while on break');
        this.punchOutChecked = false;
        return;
      }
      this.capturedPunchOutTime = currentTime24h;
      this.punchOutTime = currentTime;
      this.isPunchedOut = true;
      this.punchOutChecked = false;
      this.stopLiveTimer();
      this.finalizeAndSaveLog();
      return;
    }

    this.notificationService.error('Please select an action to capture');
  }

  /**
   * Format time with AM/PM
   */
  private formatTimeWithAMPM(date: Date): string {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${hours}:${minutesStr} ${ampm}`;
  }

  /**
   * Start live working hours timer
   */
  private startLiveTimer(): void {
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
    }

    this.liveTimerInterval = setInterval(() => {
      this.updateLiveWorkHours();
    }, 60000); // Update every minute

    // Initial calculation
    this.updateLiveWorkHours();
  }

  /**
   * Update live work hours display
   */
  private updateLiveWorkHours(): void {
    if (this.capturedPunchInTime) {
      const now = new Date();
      const startTime = new Date(`${this.capturedDate}T${this.capturedPunchInTime}`);
      const diffMs = now.getTime() - startTime.getTime();
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      this.liveWorkHours = `${hours}h ${minutes}m`;
    }
  }

  /**
   * Stop live timer
   */
  private stopLiveTimer(): void {
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
      this.liveTimerInterval = null;
    }
  }

  /**
   * Update cumulative break display
   */
  private updateCumulativeBreakDisplay(): void {
    const hours = Math.floor(this.cumulativeBreakMinutes / 60);
    const minutes = this.cumulativeBreakMinutes % 60;
    
    if (hours > 0) {
      this.cumulativeBreakDisplay = `${hours}h ${minutes}m`;
    } else {
      this.cumulativeBreakDisplay = `${minutes}m`;
    }
  }

  /**
   * Check if activity is available
   */
  isActivityAvailable(activity: string): boolean {
    return !this.completedActivities.includes(activity);
  }

  /**
   * Check if the selected date is in the past (read-only mode)
   */
  get isReadOnly(): boolean {
    if (!this.selectedDate) return false;
    const selected = new Date(this.selectedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);
    return selected < today;
  }

  /**
   * Handle date change - reload logs for selected date
   */
  onDateChange(): void {
    // Reset current workflow if date changes and user was in the middle of logging
    if (this.isPunchedIn && !this.isPunchedOut) {
      this.notificationService.warning('Date changed - resetting current workflow');
      this.resetWorkflow();
    }
    
    // Load time logs from backend
    this.loadTimeLogs();
    
    // Resume active session or load existing log for selected date
    setTimeout(() => {
      this.resumeActiveSession();
      // Load breaks for the selected date if log exists
      if (this.currentLogId) {
        this.loadBreaksForTimeLog(this.currentLogId);
      }
    }, 500);
  }

  /**
   * Resume active session or load completed log for selected date
   */
  private resumeActiveSession(): void {
    const selectedDateObj = new Date(this.selectedDate);
    const selectedDateFormatted = selectedDateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    
    // Find log matching the selected date
    const existingLog = this.logs.find(log => log.date === selectedDateFormatted);
    
    if (existingLog) {
      // Populate punch in time - display in AM/PM format but store raw 24h for calculations
      this.punchInTime = existingLog.startTime; // Already formatted by loadTimeLogs
      // Extract raw 24h format from the logs array for internal use
      const rawLog = this.getRawLogForDate(selectedDateFormatted);
      this.capturedPunchInTime = rawLog?.startTime || this.extractRaw24h(existingLog.startTime);
      this.capturedDate = this.selectedDate;
      
      // Format break duration display and restore cumulative break minutes
      const breakMinutes = existingLog.breakMin;
      this.cumulativeBreakMinutes = breakMinutes;
      const breakHours = Math.floor(breakMinutes / 60);
      const breakMins = breakMinutes % 60;
      this.cumulativeBreakDisplay = breakHours > 0 ? `${breakHours}h ${breakMins}m` : `${breakMins}m`;
      
      // Load breaks from database instead of parsing activity string
      this.breaks = [];
      this.completedActivities = [];
      
      // Check if session is active (no endTime) or completed (has endTime)
      // Note: convertToAMPM returns '--:-- --' for null/empty endTime
      if (!existingLog.endTime || existingLog.endTime === '' || existingLog.endTime === '--:-- --' || existingLog.endTime === existingLog.startTime) {
        // Active session - resume workflow
        this.isPunchedIn = true;
        this.isPunchedOut = false;
        this.isOnBreak = false; // Will be set by resumeActiveBreak if needed
        
        // Get the log ID from the API to enable updates
        this.fetchLogIdForDate(selectedDateFormatted);
        
        // Start live timer
        this.startLiveTimer();
        this.notificationService.success('Active session resumed');
      } else {
        // Completed session - show static data
        this.punchOutTime = existingLog.endTime; // Already formatted by loadTimeLogs
        // Extract raw 24h format for internal use
        const rawLog = this.getRawLogForDate(selectedDateFormatted);
        this.capturedPunchOutTime = rawLog?.endTime || this.extractRaw24h(existingLog.endTime);
        
        // Display total hours in live display
        const totalHours = parseFloat(existingLog.totalHours);
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours - hours) * 60);
        this.liveWorkHours = `${hours}h ${minutes}m`;
        
        // Set states to indicate completed log (read-only view)
        this.isPunchedIn = true;
        this.isPunchedOut = true;
        this.isOnBreak = false;
        
        // Get the log ID from the API to load breaks for completed session
        this.fetchLogIdForDate(selectedDateFormatted);
      }
    } else {
      // No existing log - reset to initial state for new entry
      if (!this.isPunchedIn || this.isPunchedOut) {
        this.resetWorkflow();
      }
    }
  }

  /**
   * Fetch log ID for the selected date from API (for active session updates)
   */
  private fetchLogIdForDate(dateFormatted: string): void {
    // The logs array from API should include the log ID
    // We need to get the full log object with ID from the backend
    this.apiService.getTimeLogs().subscribe({
      next: (response: any) => {
        const logsArray = response?.$values || response?.data?.$values || response || [];
        
        // Find the log matching the date
        const matchingLog = logsArray.find((log: any) => {
          const logDate = new Date(log.date);
          const logDateFormatted = logDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          });
          return logDateFormatted === dateFormatted;
        });
        
        if (matchingLog) {
          // Extract log ID using the same fallback chain as Punch In
          this.currentLogId = matchingLog?.logId || matchingLog?.id || '';
          
          // Store raw 24h time formats for calculations (before AM/PM conversion)
          if (matchingLog.startTime) {
            this.capturedPunchInTime = matchingLog.startTime.split(':').slice(0, 2).join(':');
          }
          if (matchingLog.endTime && matchingLog.endTime !== matchingLog.startTime) {
            this.capturedPunchOutTime = matchingLog.endTime.split(':').slice(0, 2).join(':');
          }
          
          // Load breaks for this time log
          if (this.currentLogId) {
            this.loadBreaksForTimeLog(this.currentLogId);
          }
        }
      },
      error: (error: any) => {
      }
    });
  }

  /**
   * Format time for display (handle various time formats)
   */
  private formatTimeDisplay(timeString: string): string {
    if (!timeString) return '--:-- --';
    
    // If already in HH:MM format, convert to 12-hour with AM/PM
    if (timeString.match(/^\d{1,2}:\d{2}$/)) {
      const [hours, minutes] = timeString.split(':').map(Number);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
    
    return timeString;
  }

  /**
   * Convert 24-hour time format to 12-hour AM/PM format
   * Handles formats like '15:16:00' or '15:16' and converts to '03:16 PM'
   */
  private convertToAMPM(time24: string): string {
    if (!time24) return '--:-- --';
    
    // Extract hours and minutes from formats like '15:16:00' or '15:16'
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

  /**
   * Resume active break after page refresh or logout/login
   */
  private resumeActiveBreak(): void {
    this.breakService.getActiveBreak().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const activeBreak = response.data;
          this.currentBreakId = activeBreak.breakId;
          this.currentLogId = activeBreak.timeLogId;
          this.isOnBreak = true;
          this.selectedActivity = activeBreak.activity;
          this.isPunchedIn = true;
          
          // Add to breaks table
          this.breaks.push({
            breakId: activeBreak.breakId,
            activity: activeBreak.activity,
            startTime: this.convertToAMPM(activeBreak.startTime),
            endTime: '--:-- --',
            duration: '--'
          });
          this.notificationService.success(`Active break resumed: ${activeBreak.activity}`);
          
          // Also load all breaks for this time log
          this.loadBreaksForTimeLog(activeBreak.timeLogId);
        } else {
          // No active break found
        }
      },
      error: (error) => {
        // Silently fail - not critical if this check fails
      }
    });
  }

  /**
   * Load all breaks for the current time log
   */
  private loadBreaksForTimeLog(timeLogId: string): void {
    if (!timeLogId) return;
    
    this.breakService.getBreaksForTimeLog(timeLogId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Clear current breaks and reload from database
          this.breaks = response.data.map(b => ({
            breakId: b.breakId,
            activity: b.activity,
            startTime: this.convertToAMPM(b.startTime),
            endTime: b.endTime ? this.convertToAMPM(b.endTime) : '--:-- --',
            duration: b.duration ? `${b.duration}m` : '--'
          }));
          
          // Calculate cumulative break minutes from completed breaks
          this.cumulativeBreakMinutes = response.data
            .filter(b => b.duration !== null)
            .reduce((sum, b) => sum + (b.duration || 0), 0);
          
          this.updateCumulativeBreakDisplay();
          
          // Update completed activities
          this.completedActivities = response.data
            .filter(b => b.endTime !== null)
            .map(b => b.activity);
        } else {
        }
      },
      error: (error) => {
        
        // Handle backend error format
        if (error.error?.errors && Array.isArray(error.error.errors)) {
        }
        
        // Show notification only for critical errors (not 404)
        if (error.status !== 404) {
          this.notificationService.error('Failed to load breaks');
        }
      }
    });
  }

  /**
   * Get current time in 24h format (HH:mm)
   */
  private getCurrentTime24h(): string {
    const now = new Date();
    return now.toTimeString().substring(0, 5);
  }

  /**
   * Delete a break record (for corrections)
   */
  deleteBreak(breakId: string): void {
    if (!confirm('Are you sure you want to delete this break?')) {
      return;
    }
    
    this.breakService.deleteBreak(breakId).subscribe({
      next: (response) => {
        if (response.success) {
          // Remove from UI
          this.breaks = this.breaks.filter(b => b.breakId !== breakId);
          
          // Reload breaks to get updated cumulative totals
          if (this.currentLogId) {
            this.loadBreaksForTimeLog(this.currentLogId);
          }
          
          this.notificationService.success('Break deleted successfully');
        } else {
          this.notificationService.error('Failed to delete break');
        }
      },
      error: (error: any) => {
        
        // Handle backend error format
        let errorMessage = 'Failed to delete break';
        if (error.error?.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
          errorMessage = error.error.errors.join(', ');
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.status === 404) {
          errorMessage = 'Break not found';
        } else if (error.status === 401) {
          errorMessage = 'You can only delete your own breaks';
        }
        
        this.notificationService.error(errorMessage);
      }
    });
  }

  /**
   * Get raw log data from API for a specific date (placeholder - raw times fetched by fetchLogIdForDate)
   */
  private getRawLogForDate(dateFormatted: string): any {
    // This method is a placeholder - raw times are now extracted directly in fetchLogIdForDate
    return null;
  }

  /**
   * Extract raw 24-hour format from AM/PM formatted time string
   * Converts '03:16 PM' back to '15:16'
   */
  private extractRaw24h(timeAMPM: string): string {
    if (!timeAMPM || timeAMPM === '--:-- --') return '';
    
    const match = timeAMPM.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return timeAMPM; // Return as-is if not in expected format
    
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  /**
   * Finalize and save log to backend
   */
  private finalizeAndSaveLog(): void {
    if (!this.capturedPunchInTime || !this.capturedPunchOutTime) {
      this.notificationService.error('Invalid punch times');
      return;
    }

    this.isSubmitting = true;

    // Calculate total hours using cumulative break minutes
    const startDateTime = new Date(`${this.capturedDate}T${this.capturedPunchInTime}`);
    const endDateTime = new Date(`${this.capturedDate}T${this.capturedPunchOutTime}`);
    const diffMs = endDateTime.getTime() - startDateTime.getTime();
    const totalHours = (diffMs / (1000 * 60 * 60)) - (this.cumulativeBreakMinutes / 60);

    if (totalHours <= 0) {
      this.notificationService.error('Invalid punch times');
      this.isSubmitting = false;
      return;
    }

    const dateObj = new Date(this.capturedDate);
    const isoDate = dateObj.toISOString();

    // Update existing log with punch out time and final hours using new API
    const updateDto: CreateTimeLogDto = {
      date: isoDate,
      startTime: `${this.capturedPunchInTime}:00`, // HH:mm:ss format
      endTime: `${this.capturedPunchOutTime}:00`, // HH:mm:ss format (no longer nullable when complete)
      breakDuration: Math.floor(this.cumulativeBreakMinutes),
      totalHours: parseFloat(totalHours.toFixed(2)),
      activity: this.completedActivities.length > 0 ? this.completedActivities.join(', ') : 'N/A'
    };
    console.log('  - date (ISO string):', typeof updateDto.date, updateDto.date);
    console.log('  - breakDuration (number):', typeof updateDto.breakDuration, updateDto.breakDuration);
    console.log('  - totalHours (number):', typeof updateDto.totalHours, updateDto.totalHours);

    console.log(`🔄 Finalizing time log - ${this.currentLogId ? 'UPDATE (PUT)' : 'CREATE (POST)'}`);
    console.log('📤 Full payload:', JSON.stringify(updateDto, null, 2));
    
    const apiCall = this.currentLogId 
      ? this.timeLogService.updateTimeLog(this.currentLogId, updateDto)
      : this.timeLogService.createTimeLog(updateDto);

    apiCall.subscribe({
      next: (response) => {
        if (response.success) {
          this.notificationService.success('Time log saved successfully');
          this.loadTimeLogs();
        } else {
          this.notificationService.error(response.message || 'Failed to save time log');
        }
        this.isSubmitting = false;
      },
      error: (error: any) => {
        
        // Display specific validation errors to user
        if (error.error?.errors) {
          const errorFields = Object.keys(error.error.errors);
          const errorMessages = errorFields.map(field => 
            `${field}: ${error.error.errors[field].join(', ')}`
          ).join('; ');
          this.notificationService.error(`Validation failed: ${errorMessages}`);
        } else {
          this.notificationService.error('Failed to save time log');
        }
        this.isSubmitting = false;
      }
    });
  }

  /**
   * Reset workflow
   */
  private resetWorkflow(): void {
    this.punchInTime = '--:-- --';
    this.punchOutTime = '--:-- --';
    this.cumulativeBreakDisplay = '0m';
    this.liveWorkHours = '0h 0m';
    this.selectedActivity = '';
    this.isPunchedIn = false;
    this.isOnBreak = false;
    this.isPunchedOut = false;
    this.completedActivities = [];
    this.punchInChecked = false;
    this.breakStartChecked = false;
    this.breakEndChecked = false;
    this.punchOutChecked = false;
    this.capturedPunchInTime = '';
    this.capturedPunchOutTime = '';
    this.currentBreakStartTime = '';
    this.capturedDate = '';
    this.cumulativeBreakMinutes = 0;
    this.breaks = [];
    this.isSubmitting = false;
    this.currentLogId = ''; // Clear the log ID
    this.currentBreakId = ''; // Clear the break ID
  }

  /**
   * Load time logs from backend
   */
  private loadTimeLogs() {
    this.apiService.getTimeLogs().subscribe({
      next: (response: any) => {
        const logsArray = response?.$values || response?.data?.$values || response || [];
        
        this.logs = logsArray.map((log: any) => ({
          date: this.formatDate(log.date),
          startTime: this.convertToAMPM(log.startTime),
          endTime: this.convertToAMPM(log.endTime),
          breakMin: log.break || 0,
          totalHours: log.totalHours.toFixed(2),
          activity: log.activity || 'N/A'
        }));

        this.updateStatistics();
      },
      error: (error: any) => {
        this.notificationService.error('Failed to load time logs');
      }
    });
  }

  /**
   * Format date for display
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Update statistics by summing totalHours from logs
   */
  private updateStatistics() {
    const today = new Date();
    const todayString = today.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    // Sum today's hours
    this.todayHours = this.logs
      .filter(log => log.date.includes(todayString))
      .reduce((sum, log) => sum + parseFloat(log.totalHours), 0);

    // Sum this week's hours (last 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weekHoursDecimal = this.logs
      .filter(log => {
        const logDate = this.parseDate(log.date);
        return logDate >= sevenDaysAgo && logDate <= today;
      })
      .reduce((sum, log) => sum + parseFloat(log.totalHours), 0);
    
    // Convert to HH:MM format
    const weekHours = Math.floor(weekHoursDecimal);
    const weekMinutes = Math.round((weekHoursDecimal - weekHours) * 60);
    this.thisWeekHours = weekHours > 0 ? `${weekHours}h ${weekMinutes}m` : `${weekMinutes}m`;

    // Count days logged
    this.daysLogged = this.logs.length;
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateString: string): Date {
    const today = new Date();
    const year = today.getFullYear();
    return new Date(`${dateString}, ${year}`);
  }
}
