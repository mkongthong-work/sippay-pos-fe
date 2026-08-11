import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { PinLoginUser } from '../../core/models';

// PIN แต่ละคนยาวได้ 4-6 หลัก ไม่เท่ากัน (แอดมินเลือกความยาวได้ตอนตั้งให้ที่หน้า "จัดการพนักงาน") หน้านี้จึง
// ไม่รู้ล่วงหน้าว่าคนที่เลือกอยู่ตั้ง PIN ไว้กี่หลัก เลยไม่ auto-submit ที่ความยาวคงที่แบบเดิม ต้องกดปุ่ม ↵
// ยืนยันเอง (กดได้ตั้งแต่พิมพ์ครบอย่างน้อย 4 หลักขึ้นไป) — ตัวเลขความยาวขั้นต่ำ/สูงสุดต้องตรงกับ pinFormat
// ฝั่ง backend (backend/handlers/user.go)
const PIN_MIN_LENGTH = 6;
const PIN_MAX_LENGTH = 6;

// หน้าเข้าระบบด้วย PIN สำหรับเครื่อง POS ที่พนักงานหลายคนใช้ร่วมกัน — โชว์แป้นกด PIN ของโปรไฟล์ที่เลือกอยู่
// ตรงๆ เลย (ไม่ต้องผ่านหน้าเลือกพนักงานเต็มจอก่อน) กดที่ชื่อ (มีลูกศร ▾) เพื่อเปิดป็อปอัพเล็กๆ "เลือกโปรไฟล์"
// สลับคนได้โดยไม่ออกจากหน้านี้ — เฉพาะพนักงานที่แอดมินตั้ง PIN ให้แล้วที่หน้า "จัดการพนักงาน" เท่านั้นจะขึ้นในรายชื่อ
@Component({
  selector: 'app-pin-login',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pin-login.component.html',
  styleUrl: './pin-login.component.scss'
})
export class PinLoginComponent implements OnInit {
  readonly pinMinLength = PIN_MIN_LENGTH;
  readonly pinMaxLength = PIN_MAX_LENGTH;

  users = signal<PinLoginUser[]>([]);
  loadingUsers = signal(false);
  selectedUser = signal<PinLoginUser | null>(null);
  profilePickerOpen = signal(false);
  pin = signal('');
  submitting = signal(false);

  // จุดวงกลมแสดงจำนวนหลักที่พิมพ์ไปแล้ว (ไม่ตรึงจำนวนช่องตายตัวเหมือนเดิม เพราะแต่ละคน PIN ยาวไม่เท่ากัน)
  allDots = computed(() => Array.from({ length: Math.max(this.pin().length, PIN_MIN_LENGTH) }));
  canConfirm = computed(() => this.pin().length >= this.pinMinLength && !this.submitting());

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadingUsers.set(true);
    this.auth.getPinLoginUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loadingUsers.set(false);
        // เข้ามาครั้งแรก ยังไม่มีใครเลือกไว้ -> ตั้งค่าเริ่มต้นเป็นคนแรกในรายชื่อไปก่อน ให้กดตัวเลขได้ทันที
        // (เปลี่ยนคนได้ตลอดผ่านป็อปอัพ "เลือกโปรไฟล์")
        if (!this.selectedUser() && users.length > 0) {
          this.selectedUser.set(users[0]);
        }
      },
      error: () => this.loadingUsers.set(false)
    });
  }

  // อักษรย่อไว้ทำวงกลม avatar เมื่อไม่มีรูปโปรไฟล์จริง (เอา 1-2 ตัวอักษรแรกของชื่อ)
  initials(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.slice(0, 2) : '?';
  }

  roleLabel(role: 'admin' | 'staff'): string {
    return role === 'admin' ? 'เจ้าของร้าน' : 'พนักงาน';
  }

  openProfilePicker(): void {
    if (this.users().length === 0) return;
    this.profilePickerOpen.set(true);
  }

  closeProfilePicker(): void {
    this.profilePickerOpen.set(false);
  }

  chooseProfile(user: PinLoginUser): void {
    this.selectedUser.set(user);
    this.pin.set('');
    this.profilePickerOpen.set(false);
  }

  pressDigit(digit: string): void {
    if (this.submitting()) return;
    const current = this.pin();
    if (current.length >= this.pinMaxLength) return;
    const next = current + digit;
    this.pin.set(next);
    if (next.length === PIN_MAX_LENGTH) {
      this.confirm();
    }
  }

  pressBackspace(): void {
    if (this.submitting()) return;
    this.pin.set(this.pin().slice(0, -1));
  }

  // กด ↵ ยืนยันเอง (แทนที่จะ auto-submit ที่ความยาวคงที่ เพราะแต่ละคน PIN ยาวไม่เท่ากัน)
  confirm(): void {
    if (!this.canConfirm()) return;
    const user = this.selectedUser();
    if (!user) return;
    const pin = this.pin();
    this.submitting.set(true);
    this.auth.pinLogin(user.id, pin).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/pos']);
      },
      error: (err) => {
        this.submitting.set(false);
        this.pin.set('');
        this.toastService.error(err?.error?.error ?? 'PIN ไม่ถูกต้อง');
      }
    });
  }
}
