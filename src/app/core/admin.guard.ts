import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

// กันไม่ให้พนักงาน (role=staff) เข้าหน้าที่สงวนไว้เฉพาะแอดมิน เช่น หน้าจัดการพนักงาน
// (ต่างจาก authGuard ที่แค่เช็คว่าล็อกอินแล้วหรือยัง)
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.user()?.role === 'admin') {
    return true;
  }

  router.navigate(['/pos']);
  return false;
};
