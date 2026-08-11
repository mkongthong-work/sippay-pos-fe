import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  CheckCircleFill,
  CloseCircleFill,
  CloseOutline,
  ExclamationCircleFill,
  InfoCircleFill
} from '@ant-design/icons-angular/icons';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    // ไอคอนที่ nz-alert ใช้ตอน nzShowIcon (ตามแต่ละ nzType) + ไอคอนปุ่มปิด (nzCloseable)
    provideNzIcons([CheckCircleFill, CloseCircleFill, ExclamationCircleFill, InfoCircleFill, CloseOutline])
  ]
};
