import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface PendingRegistration {
  registrationId: string;     // ✅ GUID comes as string
  id?: string;                // optional alias
  name: string;
  fullName?: string;
  email: string;
  role: 'Employee' | 'Manager';
  department: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedDate: string;
  processedDate?: string;
  processedByName?: string;
  rejectionReason?: string;
}
@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);

  private readonly API_URL = 'https://localhost:7172/api/Registration';

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (isPlatformBrowser(this.platformId)) {
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

  getAllRegistrations(): Observable<PendingRegistration[]> {
    return this.http.get<any>(`${this.API_URL}`, { headers: this.getHeaders() })
      .pipe(
        map(response => this.mapRegistrations(response.data || response || [])),
        catchError(err => {
          return of([]);
        })
      );
  }

  getPendingRegistrations(): Observable<PendingRegistration[]> {
    return this.http.get<any>(`${this.API_URL}/pending`, { headers: this.getHeaders() })
      .pipe(
        map(response => this.mapRegistrations(response.data || response || [])),
        catchError(err => {
          return of([]);
        })
      );
  }

  getPendingCount(): Observable<number> {
    return this.http.get<any>(`${this.API_URL}/pending/count`, { headers: this.getHeaders() })
      .pipe(
        map(response => response.data ?? 0),
        catchError(() => of(0))
      );
  }

  /** ✅ APPROVE: send GUID as-is (no parseInt) */
  approveRegistration(registrationId: string): Observable<any> {
    const id = encodeURIComponent(registrationId);
    return this.http.post<any>(
      `${this.API_URL}/${id}/approve`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /** ✅ REJECT: route id is GUID, body only needs reason */
  rejectRegistration(registrationId: string, reason = ''): Observable<any> {
    const id = encodeURIComponent(registrationId);
    return this.http.post<any>(
      `${this.API_URL}/${id}/reject`,
      { reason }, // Do not include registrationId; backend takes it from route
      { headers: this.getHeaders() }
    );
  }

  /** ✅ DELETE: route id is GUID */
  deleteRegistration(registrationId: string): Observable<any> {
    const id = encodeURIComponent(registrationId);
    return this.http.delete<any>(
      `${this.API_URL}/${id}`,
      { headers: this.getHeaders() }
    );
  }

  private mapRegistrations(data: any[]): PendingRegistration[] {
    return data.map(r => ({
      registrationId: String(r.registrationId), // ✅ ensure string
      id: String(r.registrationId),
      name: r.name,
      fullName: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
       appliedDate: r.appliedDate,
      processedDate: r.processedDate,
      processedByName: r.processedByName,
      rejectionReason: r.rejectionReason
    }));
  }
}
