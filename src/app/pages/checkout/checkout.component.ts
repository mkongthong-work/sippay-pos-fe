import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OrderService } from '../../core/order.service';
import { ShopSettingsService } from '../../core/shop-settings.service';
import { ToastService } from '../../core/toast.service';
import { DiscountType, Order, ShopSettings } from '../../core/models';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { PaymentPanelComponent } from '../../shared/payment-panel/payment-panel.component';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ReceiptComponent, PaymentPanelComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss'
})
export class CheckoutComponent implements OnInit {
  order = signal<Order | null>(null);
  loading = signal(true);
  notFound = signal(false);
  applyingDiscount = signal(false);
  paidResult = signal<Order | null>(null);

  discountType: DiscountType = 'none';
  discountValue: number | null = null;
  discountOpen = signal(false);

  // ---- พิมพ์ใบเสร็จ ----
  // โหลดทันทีตอนเข้าเพจ (ไม่รอจนกดพิมพ์) เพราะตอนนี้ PaymentPanelComponent ต้องใช้ข้อมูลร้านค้า
  // (เลขพร้อมเพย์) ไปสร้าง QR ทันทีที่เลือกวิธีชำระเป็นโอนเงินด้วย
  shopSettings = signal<ShopSettings | null>(null);
  receiptOpen = signal(false);
  // ติ๊กไว้เป็นค่าเริ่มต้น — ปิดบิลสำเร็จแล้วเปิด+สั่งพิมพ์ใบเสร็จให้อัตโนมัติ ไม่ต้องกดปุ่มเอง
  autoPrintAfterPayment = true;

  private orderId!: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderService: OrderService,
    private shopSettingsService: ShopSettingsService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
    if (!this.shopSettings()) {
      this.shopSettingsService.getShopSettings().subscribe((s) => this.shopSettings.set(s));
    }
  }

  load(): void {
    this.loading.set(true);
    this.orderService.getOrder(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.discountType = order.discount_type ?? 'none';
        this.discountValue = order.discount_value || null;
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      }
    });
  }

  openDiscount(): void {
    this.discountOpen.set(true);
  }

  closeDiscount(): void {
    this.discountOpen.set(false);
  }

  applyDiscount(): void {
    this.applyingDiscount.set(true);
    const value = this.discountType === 'none' ? 0 : (this.discountValue ?? 0);
    this.orderService.updateDiscount(this.orderId, this.discountType, value).subscribe({
      next: (order) => {
        this.order.set(order);
        this.applyingDiscount.set(false);
        this.discountOpen.set(false); // ใส่เสร็จแล้วพับกลับ ให้หน้าจอกระชับ
        // ยอดสุทธิเปลี่ยนไปตามส่วนลดใหม่ — PaymentPanelComponent เห็น order() เปลี่ยนแล้วสร้าง QR ใหม่ให้เอง
      },
      error: (err) => {
        this.applyingDiscount.set(false);
        this.toastService.error(err?.error?.error ?? 'ใส่ส่วนลดไม่สำเร็จ');
      }
    });
  }

  clearDiscount(): void {
    this.discountType = 'none';
    this.discountValue = null;
    this.applyDiscount();
  }

  // เรียกจาก <app-payment-panel> ตอนปิดบิลสำเร็จ (ไม่ว่าจะจ่ายเงินสดหรือโอนเงิน — ดู
  // PaymentPanelComponent.confirmPayment() ที่ยิง event นี้หลังเรียก orderService.pay() สำเร็จ)
  onPaid(paid: Order): void {
    this.paidResult.set(paid);
    this.autoPrintReceiptIfEnabled();
  }

  // ปุ่ม "แยกชำระ" — ยังไม่รองรับจริงในระบบนี้ (backend เก็บได้แค่การชำระ 1 รายการต่อ 1 ออเดอร์)
  // ทำไว้แค่รูปลักษณ์ปุ่มให้ตรงดีไซน์อ้างอิง กดแล้วแจ้งเตือนตรงๆ ว่ายังไม่เปิดใช้งาน
  showSplitPaymentInfo(): void {
    this.toastService.info('ฟีเจอร์แยกชำระยังไม่เปิดใช้งานในระบบนี้');
  }

  // ปุ่ม "เพิ่มสมาชิก" — ยกมาจากดีไซน์ต้นแบบเช่นกัน แต่ระบบนี้ยังไม่มีระบบสมาชิกลูกค้าจริง
  // (แบบเดียวกับปุ่มนี้ที่หน้า POS — ดู pos.component.ts showMemberInfo())
  showMemberInfo(): void {
    this.toastService.info('ฟีเจอร์เพิ่มสมาชิกยังไม่เปิดใช้งานในระบบนี้');
  }

  // จำนวนชิ้นรวมทั้งบิล (แสดงเป็นแบดจ์หัวรายการ เช่น "2 ชิ้น")
  itemsCount(o: Order): number {
    return o.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  backToOrders(): void {
    this.router.navigate(['/orders']);
  }

  // ดาวน์โหลด/เปิดดู PDF ใบเสร็จของบิลที่เพิ่งปิด — เปิดในแท็บใหม่ให้เลย (เบราว์เซอร์แสดง PDF หรือดาวน์โหลด
  // ให้เองตามการตั้งค่าของผู้ใช้) ใช้ blob URL เพราะ endpoint ต้องแนบ Authorization header (ดู
  // OrderService.downloadInvoicePdf)
  downloadingInvoice = signal(false);

  downloadInvoicePdf(): void {
    const paid = this.paidResult();
    if (!paid) return;
    this.downloadingInvoice.set(true);
    this.orderService.downloadInvoicePdf(paid.id).subscribe({
      next: (blob) => {
        this.downloadingInvoice.set(false);
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        this.downloadingInvoice.set(false);
        this.toastService.error('ดาวน์โหลดใบเสร็จ PDF ไม่สำเร็จ');
      }
    });
  }

  // ---- พิมพ์ใบเสร็จ ----

  openReceipt(): void {
    // โหลดข้อมูลร้านค้าเฉพาะตอนจะเปิดใบเสร็จจริง (ไม่ต้องโหลดล่วงหน้าทุกครั้งที่เข้าหน้าคิดเงิน)
    if (!this.shopSettings()) {
      this.shopSettingsService.getShopSettings().subscribe((s) => this.shopSettings.set(s));
    }
    this.receiptOpen.set(true);
  }

  closeReceipt(): void {
    this.receiptOpen.set(false);
  }

  // เรียกหลังปิดบิลสำเร็จ ถ้าติ๊ก "พิมพ์ใบเสร็จหลังเก็บเงิน" ไว้ -> เปิดใบเสร็จแล้วสั่งพิมพ์ให้อัตโนมัติ
  // (รอข้อมูลร้านค้าโหลดเสร็จก่อน ถ้ายังไม่เคยโหลด กันใบเสร็จพิมพ์ออกมาไม่มีชื่อร้าน)
  private autoPrintReceiptIfEnabled(): void {
    if (!this.autoPrintAfterPayment) return;
    const doPrint = () => {
      this.receiptOpen.set(true);
      setTimeout(() => window.print(), 100);
    };
    if (!this.shopSettings()) {
      this.shopSettingsService.getShopSettings().subscribe((s) => {
        this.shopSettings.set(s);
        doPrint();
      });
    } else {
      doPrint();
    }
  }
}
