import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Reservation } from './models';
import { API_BASE_URL } from './api-config';

export interface CreateReservationInput {
  table_id: number;
  customer_name: string;
  customer_phone?: string;
  party_size?: number;
  // ไม่ส่งมา = กันโต๊ะไว้ตอนนี้เลย (ลูกค้ามาถึงร้านแล้ว), ส่งมา = จองล่วงหน้าไว้เวลานั้น (ISO string)
  reserved_for?: string;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class ReservationService {
  constructor(private http: HttpClient) {}

  // ไม่ส่ง status จะได้เฉพาะรายการที่ยัง active (รอดำเนินการ) อยู่
  listReservations(status?: string): Observable<Reservation[]> {
    let url = `${API_BASE_URL}/reservations`;
    if (status) {
      url += `?status=${status}`;
    }
    return this.http.get<Reservation[]>(url);
  }

  createReservation(data: CreateReservationInput): Observable<Reservation> {
    return this.http.post<Reservation>(`${API_BASE_URL}/reservations`, data);
  }

  cancelReservation(id: number): Observable<Reservation> {
    return this.http.put<Reservation>(`${API_BASE_URL}/reservations/${id}/cancel`, {});
  }

  markNoShow(id: number): Observable<Reservation> {
    return this.http.put<Reservation>(`${API_BASE_URL}/reservations/${id}/no-show`, {});
  }
}
