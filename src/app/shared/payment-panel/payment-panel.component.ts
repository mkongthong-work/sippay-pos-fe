import { Component, TemplateRef, ViewChild, computed, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toDataURL } from 'qrcode';

import { OrderService } from '../../core/order.service';
import { ToastService } from '../../core/toast.service';
import { generatePromptPayPayload } from '../../core/promptpay';
import { Order, PaymentMethod, ShopSettings } from '../../core/models';

// PaymentPanelComponent คือส่วน "เลือกวิธีชำระ + กรอกจำนวนเงิน/QR + ยืนยันรับเงิน" แบบเดียวกันเป๊ะ
// ใช้ร่วมกันทั้ง 3 ที่: หน้าคิดเงินหลัก (checkout), popup "ชำระเงินเลย" ที่หน้า POS, และ popup "ชำระเงินก่อน"
// ที่หน้าคิวออเดอร์ — เดิมแต่ละหน้าต่างคนต่างเขียน UI คล้ายกันแยกกัน ทำให้ต้องแก้ 3 ที่เวลาปรับพฤติกรรม
// ตอนนี้รวมเป็น component เดียว เรียกใช้ผ่าน [order] + [shop] แล้วฟัง (paid) event ตอนปิดบิลสำเร็จพอ
//
// จัดการ state ภายในตัวเองทั้งหมด (วิธีชำระ/จำนวนเงิน/สลิป/QR) รีเซ็ตอัตโนมัติเมื่อได้รับ order คนละใบ
// (เทียบจาก order().id) ถ้าเป็นออเดอร์เดิมแต่ยอดเปลี่ยน (เช่น แก้ส่วนลดที่หน้า checkout) จะสร้าง QR ใหม่ให้
// โดยไม่ไปรีเซ็ตจำนวนเงินที่พนักงานพิมพ์ไว้แล้ว
//
// ปกติ (split=false) component จะวาดทุกอย่างเรียงต่อกันเป็นคอลัมน์เดียวให้เอง (ใช้แบบนี้ที่ popup
// "ชำระเงินเลย" หน้า POS และ popup "ชำระเงินก่อน" หน้าคิวออเดอร์)
//
// แต่หน้าคิดเงินหลัก (checkout) ดีไซน์เดิมแบ่งเป็น 2 คอลัมน์ (ซ้าย = เลือกวิธีจ่าย/QR/เงินทอน,
// ขวา = กรอกจำนวนเงิน/แป้นกด/ปุ่มยืนยัน) — ถ้าตั้ง [split]="true" ตัว component เองจะไม่วาดอะไรเลย
// (ปล่อยให้หน้า checkout ดึง leftTpl/rightTpl ไปวางเองผ่าน *ngTemplateOutlet คนละคอลัมน์ โดยอ้างถึง
// instance เดียวกันด้วย template reference variable เช่น #panel="appPaymentPanel") ทำให้ยังใช้ state/
// logic ชุดเดียวกันของ component นี้ได้ แค่สลับตำแหน่งวาด UI ตามที่แต่ละหน้าต้องการ
@Component({
  selector: 'app-payment-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  exportAs: 'appPaymentPanel',
  host: {
    '[class.split]': 'split()'
  },
  templateUrl: './payment-panel.component.html',
  styleUrl: './payment-panel.component.scss'
})
export class PaymentPanelComponent {
  order = input.required<Order>();
  shop = input<ShopSettings | null>(null);
  split = input(false);

  paid = output<Order>();

  method: PaymentMethod = 'cash';
  receivedAmount = signal<number | null>(null);
  cashInputBuffer = '';
  transferRef = '';
  slipFile: File | null = null;
  slipFileName = '';

  processing = signal(false);
  qrDataUrl = signal<string | null>(null);
  qrLoading = signal(false);

  // เปิดให้หน้าที่ใช้ [split]="true" (เช่น checkout.component) เข้าถึง template ทั้ง 2 ฝั่งได้เอง
  // ผ่าน template reference variable (#panel="appPaymentPanel") แล้วดึง panel.leftTpl / panel.rightTpl
  // ไปวาดคนละคอลัมน์ผ่าน *ngTemplateOutlet — ดู payment-panel.component.html
  @ViewChild('leftTpl', { static: true }) leftTpl!: TemplateRef<unknown>;
  @ViewChild('rightTpl', { static: true }) rightTpl!: TemplateRef<unknown>;
  @ViewChild('confirmTpl', { static: true }) confirmTpl!: TemplateRef<unknown>;

  private lastOrderId: number | null = null;
  private lastTotal: number | null = null;
  private lastShopPresent = false;

  change = computed(() => {
    const received = this.receivedAmount();
    const total = this.order().total_amount;
    if (received == null) return 0;
    return Math.max(received - total, 0);
  });

  shortfall = computed(() => {
    const received = this.receivedAmount();
    const total = this.order().total_amount;
    if (received == null) return 0;
    return Math.max(total - received, 0);
  });

  // ตัวเลือกจำนวนเงินกลม ๆ ใกล้ยอดที่ต้องจ่าย เหมือนหน้าคิดเงินหลัก (ไม่รวมยอดพอดี — มีปุ่ม "พอดี"
  // แยกต่างหากอยู่แล้วในแถวเดียวกัน ดู isExactAmount ด้านล่าง)
  quickAmounts = computed(() => {
    const total = this.order().total_amount;
    if (total <= 0) return [];
    return this.suggestAmounts(total);
  });

  // true เมื่อจำนวนเงินที่พิมพ์ไว้ตรงกับยอดพอดี — ใช้ไฮไลต์ปุ่ม "พอดี"
  isExactAmount = computed(() => this.receivedAmount() === this.order().total_amount);

  constructor(
    private orderService: OrderService,
    private toastService: ToastService
  ) {
    // เปิดใช้งานทุกครั้งที่ order()/shop() เปลี่ยน: ถ้าเป็นออเดอร์ใหม่ (id เปลี่ยน) รีเซ็ตทุกอย่างเป็นค่าเริ่มต้น
    // ถ้าเป็นออเดอร์เดิมแต่ยอดเปลี่ยน หรือข้อมูลร้านค้าเพิ่งโหลดเสร็จ ให้สร้าง QR ใหม่ (ถ้ากำลังเลือกโอนเงินอยู่)
    // โดยไม่แตะจำนวนเงินที่พิมพ์ไว้
    effect(() => {
      const o = this.order();
      const s = this.shop();
      if (!o) return;

      const isNewOrder = this.lastOrderId !== o.id;
      const totalChanged = this.lastTotal !== o.total_amount;
      const shopJustArrived = !this.lastShopPresent && !!s;
      this.lastShopPresent = !!s;

      if (isNewOrder) {
        this.lastOrderId = o.id;
        this.lastTotal = o.total_amount;
        this.method = 'cash';
        this.receivedAmount.set(o.total_amount);
        this.cashInputBuffer = String(o.total_amount);
        this.transferRef = '';
        this.slipFile = null;
        this.slipFileName = '';
        this.qrDataUrl.set(null);
        return;
      }

      if (totalChanged) {
        this.lastTotal = o.total_amount;
      }

      if ((totalChanged || shopJustArrived) && this.method === 'transfer') {
        this.buildQr();
      }
    });
  }

  private suggestAmounts(total: number): number[] {
    const roundUpTo = (amount: number, step: number) => Math.ceil(amount / step) * step;
    const candidates = new Set<number>();

    candidates.add(roundUpTo(total, 20));
    candidates.add(roundUpTo(total, 50));
    candidates.add(roundUpTo(total, 100));

    for (const banknote of [100, 500, 1000]) {
      if (banknote >= total) {
        candidates.add(banknote);
      }
    }

    return Array.from(candidates)
      .filter((amount) => amount > 0 && amount !== total)
      .sort((a, b) => a - b)
      .slice(0, 3);
  }

  selectMethod(method: PaymentMethod): void {
    this.method = method;
    if (method === 'transfer') {
      this.buildQr();
    }
  }

  private buildQr(): void {
    const shop = this.shop();
    const o = this.order();
    if (!shop?.promptpay_id || o.total_amount <= 0) {
      this.qrDataUrl.set(null);
      return;
    }
    this.qrLoading.set(true);
    const payload = generatePromptPayPayload(shop.promptpay_id, o.total_amount);
    toDataURL(payload, { width: 220, margin: 1 })
      .then((url) => {
        this.qrDataUrl.set(url);
        this.qrLoading.set(false);
      })
      .catch(() => {
        this.qrDataUrl.set(null);
        this.qrLoading.set(false);
      });
  }

  selectAmount(amount: number): void {
    this.receivedAmount.set(amount);
    this.cashInputBuffer = String(amount);
  }

  pressDigit(digit: string): void {
    if (this.cashInputBuffer === '' || this.cashInputBuffer === '0') {
      this.cashInputBuffer = digit;
    } else if (this.cashInputBuffer.length < 7) {
      this.cashInputBuffer += digit;
    }
    this.syncBufferToAmount();
  }

  pressBackspace(): void {
    this.cashInputBuffer = this.cashInputBuffer.slice(0, -1);
    this.syncBufferToAmount();
  }

  pressClear(): void {
    this.cashInputBuffer = '';
    this.syncBufferToAmount();
  }

  pressDecimal(): void {
    if (this.cashInputBuffer.includes('.')) return;
    this.cashInputBuffer = this.cashInputBuffer === '' ? '0.' : this.cashInputBuffer + '.';
    this.syncBufferToAmount();
  }

  onCashBufferTyped(value: string): void {
    let cleaned = (value ?? '').replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    this.cashInputBuffer = cleaned;
    this.syncBufferToAmount();
  }

  private syncBufferToAmount(): void {
    this.receivedAmount.set(this.cashInputBuffer === '' ? null : Number(this.cashInputBuffer));
  }

  onSlipFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.slipFile = file;
    this.slipFileName = file?.name ?? '';
  }

  confirmPayment(): void {
    const o = this.order();

    if (this.method === 'cash') {
      const received = this.receivedAmount();
      if (received == null || received < o.total_amount) {
        this.toastService.error('เงินที่รับมาต้องไม่น้อยกว่ายอดสุทธิ');
        return;
      }
      this.processing.set(true);
      this.orderService.pay(o.id, 'cash', received).subscribe({
        next: (paid) => {
          this.processing.set(false);
          this.paid.emit(paid);
        },
        error: (err) => {
          this.processing.set(false);
          this.toastService.error(err?.error?.error ?? 'ปิดบิลไม่สำเร็จ');
        }
      });
      return;
    }

    // โอนเงิน — ไม่เช็คจำนวนรับ ถือว่าโอนมาพอดียอดเสมอ
    this.processing.set(true);
    this.orderService.pay(o.id, 'transfer', o.total_amount, this.transferRef.trim() || undefined).subscribe({
      next: (paid) => {
        if (this.slipFile) {
          this.orderService.uploadPaymentSlip(o.id, { slip: this.slipFile }).subscribe({
            next: () => {
              this.processing.set(false);
              this.paid.emit(paid);
            },
            error: () => {
              this.processing.set(false);
              this.toastService.warning('ปิดบิลสำเร็จ แต่แนบสลิปไม่สำเร็จ ไปแนบใหม่ได้ที่หน้ารายงาน');
              this.paid.emit(paid);
            }
          });
        } else {
          this.processing.set(false);
          this.paid.emit(paid);
        }
      },
      error: (err) => {
        this.processing.set(false);
        this.toastService.error(err?.error?.error ?? 'ปิดบิลไม่สำเร็จ');
      }
    });
  }
}
