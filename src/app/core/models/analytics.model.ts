

/**
 * Team Summary DTO - Dashboard summary cards
 */
export interface TeamSummaryDto {
  totalTeamHours: number;
  averageHoursPerMember: number;
  completionRate: number;
  completedTasksCount: number;
  totalTasksCount: number;
  teamMemberCount: number;
  calculatedFrom: string;
  calculatedTo: string;
}

/**
 * Team Hours Trend DTO - Line chart data
 */
export interface TeamHoursTrendDto {
  trendData: TrendDataPoint[];
}

export interface TrendDataPoint {
  date: string;
  totalHours: number;
  tasksCompleted: number;
  activeMembers: number;
}

/**
 * Team Member Performance DTO - Performance table data
 */
export interface TeamMemberPerformanceDto {
  members: MemberPerformance[];
}

export interface MemberPerformance {
  userId: string;
  name: string;
  email: string;
  totalHours: number;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksPending: number;
  efficiencyScore: number;
  performanceStatus: 'Excellent' | 'Good' | 'Needs Attention';
  averageTaskCompletionTime: number;
  overdueTasksCount: number;
}

/**
 * Task Completion Breakdown DTO - Doughnut chart data
 */
export interface TaskCompletionBreakdownDto {
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  rejectedCount: number;
  overdueCount: number;
  totalCount: number;
  completionPercentage: number;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string | null;
  data: T;
  errors?: string[] | null;
}
