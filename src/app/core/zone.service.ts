import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Zone } from './models';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class ZoneService {
  constructor(private http: HttpClient) {}

  getZones(): Observable<Zone[]> {
    return this.http.get<Zone[]>(`${API_BASE_URL}/zones`);
  }

  createZone(name: string): Observable<Zone> {
    return this.http.post<Zone>(`${API_BASE_URL}/zones`, { name });
  }

  updateZone(id: number, data: Partial<Pick<Zone, 'name' | 'is_active'>>): Observable<Zone> {
    return this.http.put<Zone>(`${API_BASE_URL}/zones/${id}`, data);
  }
}
