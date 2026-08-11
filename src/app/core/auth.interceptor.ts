import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

// แนบ JWT token ไปกับทุก request อัตโนมัติ ถ้ามีการล็อกอินอยู่
// ถ้า backend ตอบ 401 กลับมา (token ไม่มี/ผิด/หมดอายุ) ให้ล้างข้อมูลล็อกอินแล้วเด้งไปหน้า login ทันที
// ไม่ต้องรอให้แต่ละหน้าเช็คเอง
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // ยกเว้นตอนกำลัง login เอง (ทั้งแบบรหัสผ่านและ PIN) เพราะ 401 ตรงนั้นแปลว่า username/password
      // หรือ PIN ผิด ไม่ใช่ token หมดอายุ ต้องปล่อยให้หน้า login โชว์ข้อความ error ตามปกติ ไม่ใช่เด้งตัวเอง
      const isLoginRequest = req.url.includes('/auth/login') || req.url.includes('/auth/pin-login');
      if (err.status === 401 && !isLoginRequest) {
        auth.logout();
        // ค่าเริ่มต้นเด้งกลับไปหน้า PIN (เร็วกว่าสำหรับเครื่อง POS ที่ใช้ร่วมกัน)
        router.navigate(['/pin-login']);
      }
      return throwError(() => err);
    })
  );
};
