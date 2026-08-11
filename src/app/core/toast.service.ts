import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

// ศูนย์กลางแจ้งเตือนของทั้งระบบ — ทุกหน้าเรียกใช้ตัวเดียวกัน แสดงผลเป็น toast ลอยกลางบนสุดของจอเสมอ
// (แทนที่ nz-alert แบบฝังอยู่ในหน้า ซึ่งอาจถูกเลื่อนพ้นจอหรือซ่อนอยู่ใน panel ที่ scroll ได้)
// ให้ ToastContainerComponent (mount ไว้ที่ app.component.html จุดเดียว) subscribe toasts() แล้ววาดผล
@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<ToastMessage[]>([]);

  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(type: ToastType, text: string, durationMs = 4000): void {
    if (!text) return;
    const id = this.nextId++;
    this.toasts.set([...this.toasts(), { id, type, text }]);
    const timer = setTimeout(() => this.dismiss(id), durationMs);
    this.timers.set(id, timer);
  }

  success(text: string, durationMs?: number): void {
    this.show('success', text, durationMs);
  }

  error(text: string, durationMs?: number): void {
    // ข้อความ error ให้ค้างนานกว่าปกติหน่อย เผื่ออ่านไม่ทัน
    this.show('error', text, durationMs ?? 5500);
  }

  info(text: string, durationMs?: number): void {
    this.show('info', text, durationMs);
  }

  warning(text: string, durationMs?: number): void {
    this.show('warning', text, durationMs ?? 5000);
  }

  dismiss(id: number): void {
    this.toasts.set(this.toasts().filter((t) => t.id !== id));
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
