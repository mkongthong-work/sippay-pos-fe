import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { DailyReport, SalesRangeReport } from './models';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class ReportService {
  constructor(private http: HttpClient) {}

  getDaily(date?: string): Observable<DailyReport> {
    let url = `${API_BASE_URL}/reports/daily`;
    if (date) {
      url += `?date=${date}`;
    }
    return this.http.get<DailyReport>(url);
  }

  getRange(from: string, to: string): Observable<SalesRangeReport> {
    return this.http.get<SalesRangeReport>(`${API_BASE_URL}/reports/range?from=${from}&to=${to}`);
  }
}
