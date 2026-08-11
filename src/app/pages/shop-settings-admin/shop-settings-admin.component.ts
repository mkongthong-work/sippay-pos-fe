import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ShopSettingsService } from '../../core/shop-settings.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-shop-settings-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shop-settings-admin.component.html'
})
export class ShopSettingsAdminComponent implements OnInit {
  loading = signal(true);
  saving = signal(false);

  name = '';
  address = '';
  phone = '';
  taxId = '';
  // เลขพร้อมเพย์ (เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก) + ชื่อผู้รับเงินที่จะฝังใน QR
  // ตอนหน้าคิดเงินเลือกโอนเงิน (ไม่บังคับกรอก — ถ้าว่างหน้าคิดเงินจะไม่แสดง QR ให้)
  promptPayId = '';
  promptPayName = '';

  constructor(
    private shopSettingsService: ShopSettingsService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.shopSettingsService.getShopSettings().subscribe({
      next: (s) => {
        this.name = s.name;
        this.address = s.address;
        this.phone = s.phone;
        this.taxId = s.tax_id;
        this.promptPayId = s.promptpay_id;
        this.promptPayName = s.promptpay_name;
        this.loading.set(false);
      },
      error: (err) => {
        this.toastService.error(err?.error?.error ?? 'โหลดข้อมูลร้านค้าไม่สำเร็จ');
        this.loading.set(false);
      }
    });
  }

  // เลขพร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลักเท่านั้น (ตัดขีด/วรรคออกก่อนนับ)
  // ตรวจตอนกดบันทึกเพื่อกันตั้งค่าเลขผิดรูปแบบแล้ว QR สร้างไม่ได้/ผิดพลาดตอนใช้งานจริงที่หน้าคิดเงิน
  private isValidPromptPayId(id: string): boolean {
    const digitsOnly = id.replace(/[-\s]/g, '');
    return digitsOnly.length === 10 || digitsOnly.length === 13;
  }

  save(): void {
    if (!this.name.trim()) {
      this.toastService.error('กรุณากรอกชื่อร้าน');
      return;
    }
    const promptPayId = this.promptPayId.trim();
    if (promptPayId && !this.isValidPromptPayId(promptPayId)) {
      this.toastService.error('เลขพร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก');
      return;
    }
    this.saving.set(true);
    this.shopSettingsService
      .updateShopSettings({
        name: this.name.trim(),
        address: this.address.trim(),
        phone: this.phone.trim(),
        tax_id: this.taxId.trim(),
        promptpay_id: promptPayId,
        promptpay_name: this.promptPayName.trim()
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toastService.success('บันทึกข้อมูลร้านค้าเรียบร้อย');
        },
        error: (err) => {
          this.saving.set(false);
          this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ');
        }
      });
  }
}
