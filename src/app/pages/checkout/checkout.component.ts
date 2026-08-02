import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OrderService } from '../../core/order.service';
import { DiscountType, Order } from '../../core/models';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss'
})
export class CheckoutComponent implements OnInit {
  order = signal<Order | null>(null);
  loading = signal(true);
  notFound = signal(false);
  error = signal<string | null>(null);
  applyingDiscount = signal(false);
  paying = signal(false);
  paidResult = signal<Order | null>(null);

  // เป็น signal เพื่อให้ "เงินทอน" คำนวณสดทันทีที่พิมพ์หรือกดปุ่มลัด (ก่อนหน้านี้เป็น field ธรรมดา
  // ทำให้ computed() ไม่รู้ว่าค่าต้องคำนวณใหม่ตอนพิมพ์ — แก้เป็น signal เพื่อให้ reactive จริง)
  receivedAmount = signal<number | null>(null);

  // บัฟเฟอร์ตัวเลขของแป้นกดเงินสดแบบเครื่องคิดเลข (ปุ่ม 0-9, ⌫ ลบทีละหลัก, C ล้างทั้งหมด)
  // เก็บเป็น string เพื่อให้พิมพ์ต่อกันได้ถูกต้อง (เช่น กด 1,0,0 -> "100") แล้ว sync เข้า receivedAmount
  cashInputBuffer = '';

  discountType: DiscountType = 'none';
  discountValue: number | null = null;
  discountOpen = signal(false);

  private orderId!: number;

  change = computed(() => {
    const o = this.order();
    const received = this.receivedAmount();
    if (!o || received == null) return 0;
    return Math.max(received - o.total_amount, 0);
  });

  shortfall = computed(() => {
    const o = this.order();
    const received = this.receivedAmount();
    if (!o || received == null) return 0;
    return Math.max(o.total_amount - received, 0);
  });

  // ตัวเลือกจำนวนเงินกลม ๆ ใกล้ยอดที่ต้องจ่าย ให้กดเลือกได้เร็วแทนพิมพ์เอง
  // เช่น ยอด 237 บาท -> เสนอ 237 (พอดี), 240, 250, 300, 500
  quickAmounts = computed(() => {
    const o = this.order();
    if (!o || o.total_amount <= 0) return [];
    return this.suggestAmounts(o.total_amount);
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.orderService.getOrder(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.discountType = order.discount_type ?? 'none';
        this.discountValue = order.discount_value || null;
        this.receivedAmount.set(order.total_amount);
        this.cashInputBuffer = String(order.total_amount);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      }
    });
  }

  private suggestAmounts(total: number): number[] {
    const roundUpTo = (amount: number, step: number) => Math.ceil(amount / step) * step;
    const candidates = new Set<number>();

    candidates.add(Math.ceil(total)); // ยอดพอดี
    candidates.add(roundUpTo(total, 20));
    candidates.add(roundUpTo(total, 50));
    candidates.add(roundUpTo(total, 100));

    for (const banknote of [100, 500, 1000]) {
      if (banknote >= total) {
        candidates.add(banknote);
      }
    }

    return Array.from(candidates)
      .filter((amount) => amount > 0)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }

  selectAmount(amount: number): void {
    this.receivedAmount.set(amount);
    this.cashInputBuffer = String(amount);
  }

  onReceivedAmountChange(value: number | null): void {
    this.receivedAmount.set(value);
    this.cashInputBuffer = value === null ? '' : String(value);
  }

  // ---- แป้นกดเงินสดแบบเครื่องคิดเลข ----

  pressDigit(digit: string): void {
    if (this.cashInputBuffer === '' || this.cashInputBuffer === '0') {
      this.cashInputBuffer = digit;
    } else if (this.cashInputBuffer.length < 7) {
      // กันไม่ให้พิมพ์ยาวเกินไป (สูงสุด 7 หลัก ~ 9,999,999 บาท ก็เกินพอแล้ว)
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

  private syncBufferToAmount(): void {
    this.receivedAmount.set(this.cashInputBuffer === '' ? null : Number(this.cashInputBuffer));
  }

  openDiscount(): void {
    this.discountOpen.set(true);
  }

  closeDiscount(): void {
    this.discountOpen.set(false);
  }

  applyDiscount(): void {
    this.applyingDiscount.set(true);
    this.error.set(null);
    const value = this.discountType === 'none' ? 0 : (this.discountValue ?? 0);
    this.orderService.updateDiscount(this.orderId, this.discountType, value).subscribe({
      next: (order) => {
        this.order.set(order);
        this.applyingDiscount.set(false);
        this.discountOpen.set(false); // ใส่เสร็จแล้วพับกลับ ให้หน้าจอกระชับ
      },
      error: (err) => {
        this.applyingDiscount.set(false);
        this.error.set(err?.error?.error ?? 'ใส่ส่วนลดไม่สำเร็จ');
      }
    });
  }

  clearDiscount(): void {
    this.discountType = 'none';
    this.discountValue = null;
    this.applyDiscount();
  }

  confirmPayment(): void {
    const o = this.order();
    const received = this.receivedAmount();
    if (!o) return;
    if (received == null || received < o.total_amount) {
      this.error.set('เงินที่รับมาต้องไม่น้อยกว่ายอดสุทธิ');
      return;
    }
    this.error.set(null);
    this.paying.set(true);
    this.orderService.pay(o.id, 'cash', received).subscribe({
      next: (paid) => {
        this.paying.set(false);
        this.paidResult.set(paid);
      },
      error: (err) => {
        this.paying.set(false);
        this.error.set(err?.error?.error ?? 'ปิดบิลไม่สำเร็จ');
      }
    });
  }

  backToOrders(): void {
    this.router.navigate(['/orders']);
  }
}
