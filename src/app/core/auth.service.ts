import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { PinLoginUser, User } from './models';
import { API_BASE_URL } from './api-config';

const TOKEN_KEY = 'pos_token';
const USER_KEY = 'pos_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private userSignal = signal<User | null>(this.loadUser());

  readonly user = computed(() => this.userSignal());
  readonly isLoggedIn = computed(() => !!this.tokenSignal());

  constructor(private http: HttpClient) {}

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  login(username: string, password: string): Observable<{ token: string; user: User }> {
    return this.http
      .post<{ token: string; user: User }>(`${API_BASE_URL}/auth/login`, { username, password })
      .pipe(tap((res) => this.applySession(res)));
  }

  // รายชื่อพนักงานที่ตั้ง PIN ไว้แล้ว + ยังเปิดใช้งานบัญชีอยู่ — ใช้แสดงเป็นการ์ดให้เลือกที่หน้า "เข้าด้วย PIN"
  // เป็น route สาธารณะ ไม่ต้องมี token ก่อน (ยังไม่ได้ล็อกอิน)
  getPinLoginUsers(): Observable<PinLoginUser[]> {
    return this.http.get<PinLoginUser[]>(`${API_BASE_URL}/auth/pin-users`);
  }

  // ล็อกอินด้วย PIN 6 หลักแทนรหัสผ่าน (หลังเลือกพนักงานจาก getPinLoginUsers() แล้ว) response รูปแบบเดียว
  // กับ login() ปกติ เก็บ session แบบเดียวกัน
  pinLogin(userId: number, pin: string): Observable<{ token: string; user: User }> {
    return this.http
      .post<{ token: string; user: User }>(`${API_BASE_URL}/auth/pin-login`, { user_id: userId, pin })
      .pipe(tap((res) => this.applySession(res)));
  }

  private applySession(res: { token: string; user: User }): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.tokenSignal.set(res.token);
    this.userSignal.set(res.user);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  getToken(): string | null {
    return this.tokenSignal();
  }
}
