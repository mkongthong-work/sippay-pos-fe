import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { DiningTable } from './models';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class TableService {
  constructor(private http: HttpClient) {}

  getTables(): Observable<DiningTable[]> {
    return this.http.get<DiningTable[]>(`${API_BASE_URL}/tables`);
  }

  createTable(data: Partial<DiningTable>): Observable<DiningTable> {
    return this.http.post<DiningTable>(`${API_BASE_URL}/tables`, data);
  }

  updateTable(id: number, data: Partial<DiningTable>): Observable<DiningTable> {
    return this.http.put<DiningTable>(`${API_BASE_URL}/tables/${id}`, data);
  }
}
