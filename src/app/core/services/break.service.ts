import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateBreakDto, EndBreakDto, BreakResponseDto } from '../models/break.model';
import { ApiResponse } from '../models/time-log.model';

@Injectable({ providedIn: 'root' })
export class BreakService {
  private http = inject(HttpClient);
  
  private readonly baseUrl = '/api/break';
  private readonly timeLogUrl = '/api/timelog';

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
          if (user?.token) {
            headers = headers.set('Authorization', `Bearer ${user.token}`);
          }
        } catch (e) {
        }
      }
    }
    return headers;
  }

  // ---------------------------
  // API Methods
  // ---------------------------

  /**
   * Start a new break
   * POST /api/break
   */
  startBreak(dto: CreateBreakDto): Observable<ApiResponse<BreakResponseDto>> {
    return this.http.post<ApiResponse<BreakResponseDto>>(
      this.baseUrl,
      dto,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * End an active break
   * PUT /api/break/{breakId}/end
   */
  endBreak(breakId: string, dto: EndBreakDto): Observable<ApiResponse<BreakResponseDto>> {
    return this.http.put<ApiResponse<BreakResponseDto>>(
      `${this.baseUrl}/${breakId}/end`,
      dto,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Get all breaks for a specific time log
   * GET /api/timelog/{timeLogId}/breaks
   */
  getBreaksForTimeLog(timeLogId: string): Observable<ApiResponse<BreakResponseDto[]>> {
    return this.http.get<ApiResponse<BreakResponseDto[]>>(
      `${this.timeLogUrl}/${timeLogId}/breaks`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Get currently active break for the logged-in user
   * GET /api/break/active
   * Used for break resume logic after logout/refresh
   */
  getActiveBreak(): Observable<ApiResponse<BreakResponseDto | null>> {
    return this.http.get<ApiResponse<BreakResponseDto | null>>(
      `${this.baseUrl}/active`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Delete a break record (for corrections)
   * DELETE /api/break/{breakId}
   */
  deleteBreak(breakId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${this.baseUrl}/${breakId}`,
      { headers: this.getAuthHeaders() }
    );
  }
}

