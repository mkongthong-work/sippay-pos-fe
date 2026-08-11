import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { User } from './models';
import { API_BASE_URL } from './api-config';

export interface CreateUserInput {
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'staff';
  // PIN 6 หลัก ไม่บังคับตอนสร้าง มาตั้งทีหลังตอนแก้ไขพนักงานก็ได้
  pin?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: 'admin' | 'staff';
  // ส่งเฉพาะตอนจะรีเซ็ตรหัสผ่านใหม่ ไม่ส่งถ้าไม่แก้
  password?: string;
  is_active?: boolean;
  // PIN 6 หลัก — ส่งค่ามาตั้ง/แก้ไข PIN ใหม่, ส่งสตริงว่าง "" เพื่อล้าง PIN ทิ้ง, ไม่ส่งฟิลด์นี้ (undefined)
  // แปลว่าไม่แตะ PIN เดิม
  pin?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${API_BASE_URL}/users`);
  }

  createUser(data: CreateUserInput): Observable<User> {
    return this.http.post<User>(`${API_BASE_URL}/users`, data);
  }

  updateUser(id: number, data: UpdateUserInput): Observable<User> {
    return this.http.put<User>(`${API_BASE_URL}/users/${id}`, data);
  }
}
