import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { UserService } from '../../core/user.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { User } from '../../core/models';

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.'
];

@Component({
  selector: 'app-staff-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-admin.component.html'
})
export class StaffAdminComponent implements OnInit {
  users = signal<User[]>([]);

  // ---- popup เพิ่มพนักงาน ----
  addModalOpen = signal(false);
  newUsername = '';
  newPassword = '';
  newName = '';
  newRole: 'admin' | 'staff' = 'staff';

  // ---- popup แก้ไขพนักงาน ----
  editModalUser = signal<User | null>(null);
  editName = '';
  editRole: 'admin' | 'staff' = 'staff';
  // เว้นว่างไว้ถ้าไม่ต้องการรีเซ็ตรหัสผ่าน
  editPassword = '';

  // ---- popup รีเซ็ต PIN (แป้นกดตัวเลข) — เปิดจากปุ่ม "ตั้ง PIN"/"เปลี่ยน PIN" ในหน้าแก้ไขพนักงาน ----
  readonly pinMinLength = PIN_MIN_LENGTH;
  readonly pinMaxLength = PIN_MAX_LENGTH;
  pinModalUser = signal<User | null>(null);
  pinModalValue = signal('');
  savingPin = signal(false);

  constructor(
    private userService: UserService,
    private auth: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.userService.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดรายชื่อพนักงานไม่สำเร็จ')
    });
  }

  // กันแก้ไข role/ปิดใช้งานบัญชีตัวเองพลาดจาก UI (backend เช็คซ้ำอีกชั้นอยู่แล้ว)
  isSelf(user: User): boolean {
    return this.auth.user()?.id === user.id;
  }

  // วันที่ตั้ง/แก้ไข PIN ล่าสุด แบบไทย เช่น "7 ส.ค. 2569 11:03" — โชว์ในหน้าแก้ไขพนักงาน
  formatPinUpdatedAt(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const buddhistYear = d.getFullYear() + 543;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${buddhistYear} ${hh}:${mm}`;
  }

  // ---- เพิ่มพนักงาน ----

  openAddModal(): void {
    this.newUsername = '';
    this.newPassword = '';
    this.newName = '';
    this.newRole = 'staff';
    this.addModalOpen.set(true);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
  }

  addUser(): void {
    if (!this.newUsername.trim() || !this.newName.trim()) {
      this.toastService.error('กรอกชื่อผู้ใช้และชื่อพนักงานให้ครบ');
      return;
    }
    if (this.newPassword.length < 6) {
      this.toastService.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    this.userService
      .createUser({
        username: this.newUsername.trim(),
        password: this.newPassword,
        name: this.newName.trim(),
        role: this.newRole
      })
      .subscribe({
        next: () => {
          this.closeAddModal();
          this.reload();
        },
        error: (err) => this.toastService.error(err?.error?.error ?? 'เพิ่มพนักงานไม่สำเร็จ')
      });
  }

  // ---- แก้ไขพนักงาน ----

  openEditModal(user: User): void {
    this.editModalUser.set(user);
    this.editName = user.name;
    this.editRole = user.role;
    this.editPassword = '';
  }

  closeEditModal(): void {
    this.editModalUser.set(null);
  }

  saveEditUser(): void {
    const user = this.editModalUser();
    if (!user) return;
    if (!this.editName.trim()) {
      this.toastService.error('กรอกชื่อพนักงาน');
      return;
    }
    if (this.editPassword && this.editPassword.length < 6) {
      this.toastService.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    this.userService
      .updateUser(user.id, {
        name: this.editName.trim(),
        role: this.editRole,
        password: this.editPassword ? this.editPassword : undefined
      })
      .subscribe({
        next: () => {
          this.closeEditModal();
          this.reload();
        },
        error: (err) => this.toastService.error(err?.error?.error ?? 'แก้ไขพนักงานไม่สำเร็จ')
      });
  }

  // ---- รีเซ็ต PIN (แป้นกดตัวเลข) ----

  openPinModal(user: User): void {
    this.pinModalUser.set(user);
    this.pinModalValue.set('');
  }

  closePinModal(): void {
    if (this.savingPin()) return;
    this.pinModalUser.set(null);
  }

  pinCanSave(): boolean {
    const len = this.pinModalValue().length;
    return len >= this.pinMinLength && len <= this.pinMaxLength && !this.savingPin();
  }

  pinPressDigit(digit: string): void {
    if (this.savingPin()) return;
    const current = this.pinModalValue();
    if (current.length >= this.pinMaxLength) return;
    this.pinModalValue.set(current + digit);
  }

  pinBackspace(): void {
    if (this.savingPin()) return;
    this.pinModalValue.set(this.pinModalValue().slice(0, -1));
  }

  pinClear(): void {
    if (this.savingPin()) return;
    this.pinModalValue.set('');
  }

  savePinModal(): void {
    const user = this.pinModalUser();
    if (!user || !this.pinCanSave()) return;
    this.savingPin.set(true);
    this.userService.updateUser(user.id, { pin: this.pinModalValue() }).subscribe({
      next: (updated) => {
        this.savingPin.set(false);
        this.pinModalUser.set(null);
        this.toastService.success('บันทึก PIN แล้ว');
        this.reload();
        // ถ้าหน้าต่างแก้ไขพนักงานเปิดค้างอยู่กับคนเดียวกัน อัปเดตสถานะ PIN ให้เห็นผลทันทีไม่ต้องรอปิด-เปิดใหม่
        const current = this.editModalUser();
        if (current && current.id === user.id) {
          this.editModalUser.set({ ...current, has_pin: true, pin_updated_at: updated.pin_updated_at });
        }
      },
      error: (err) => {
        this.savingPin.set(false);
        this.toastService.error(err?.error?.error ?? 'ตั้ง PIN ไม่สำเร็จ');
      }
    });
  }

  // ลบ PIN ของพนักงานคนนี้ทิ้ง (ปิดการล็อกอินด้วย PIN ของคนนี้ไปเลย จนกว่าจะตั้งใหม่)
  clearPin(user: User): void {
    if (!confirm(`ลบ PIN ของ "${user.name}" ทิ้ง? คนนี้จะเข้าด้วย PIN ไม่ได้จนกว่าจะตั้งใหม่`)) return;
    this.userService.updateUser(user.id, { pin: '' }).subscribe({
      next: () => {
        this.toastService.success('ลบ PIN แล้ว');
        this.reload();
        const current = this.editModalUser();
        if (current && current.id === user.id) {
          this.editModalUser.set({ ...current, has_pin: false, pin_updated_at: null });
        }
      },
      error: (err) => this.toastService.error(err?.error?.error ?? 'ลบ PIN ไม่สำเร็จ')
    });
  }

  // เปิด/ปิดใช้งานบัญชี เช่น พนักงานลาออก โดยไม่ต้องลบทิ้งจริง
  toggleActive(user: User): void {
    if (this.isSelf(user)) return;
    this.userService.updateUser(user.id, { is_active: !user.is_active }).subscribe({
      next: () => this.reload(),
      error: (err) => this.toastService.error(err?.error?.error ?? 'แก้ไขสถานะไม่สำเร็จ')
    });
  }
}
