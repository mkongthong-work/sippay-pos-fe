import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

// กันไม่ให้เข้าหน้าในระบบถ้ายังไม่ได้ล็อกอิน
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  // ค่าเริ่มต้นให้เข้าด้วย PIN ก่อน (เร็วกว่าสำหรับเครื่อง POS ที่ใช้ร่วมกัน) — ยังกดสลับไปหน้า
  // ชื่อผู้ใช้+รหัสผ่านแบบเดิมได้จากลิงก์ในหน้า PIN
  router.navigate(['/pin-login']);
  return false;
};
