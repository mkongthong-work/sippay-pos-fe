import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ToastService } from '../../core/toast.service';

// mount ไว้ที่ app.component.html จุดเดียว (position: fixed) เพื่อให้ toast ลอยอยู่บนสุดของทุกหน้าเสมอ
// ไม่ขึ้นกับว่าหน้านั้น scroll หรือมี panel ซ้อนกันกี่ชั้น
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  constructor(public toastService: ToastService) {}
}
