import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toDataURL } from 'qrcode';

import { OrderService } from '../../core/order.service';
import { MenuService } from '../../core/menu.service';
import { TableService } from '../../core/table.service';
import { ZoneService } from '../../core/zone.service';
import { ShopSettingsService } from '../../core/shop-settings.service';
import { ToastService } from '../../core/toast.service';
import { generatePromptPayPayload } from '../../core/promptpay';
import { formatThaiTimestamp } from '../../core/thai-date';
import { Category, DiningTable, MenuItem, Order, OrderStatus, ShopSettings, Zone } from '../../core/models';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { PaymentPanelComponent } from '../../shared/payment-panel/payment-panel.component';
import { LoadingIconComponent } from '../../shared/loading-icon/loading-icon.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ReceiptComponent, PaymentPanelComponent, LoadingIconComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnInit, OnDestroy {
  // รายการออเดอร์ทั้งหมดทุกสถานะ (ไม่กรองจาก backend) — กรองตามเดือน/แท็บ/คำค้นหาฝั่ง frontend ทั้งหมด
  // เพราะ backend ยังไม่มี endpoint กรองช่วงวันที่ และจำนวนออเดอร์ของร้านขนาดนี้ยังโหลดทีเดียวไหวสบายๆ
  allOrders = signal<Order[]>([]);
  loading = signal(false);
  // true เมื่อโหลดรายการออเดอร์ล่าสุดไม่สำเร็จ (เช่น เน็ตหลุด/เซิร์ฟเวอร์ล่ม) — โชว์กล่องแดง + ปุ่ม
  // "ลองอีกครั้ง" แทนรายการว่างเปล่า (ดีไซน์ 6b: สถานะว่าง/กำลังโหลด/ผิดพลาด)
  loadError = signal(false);
  shopSettings = signal<ShopSettings | null>(null);

  // เช็คสถานะกับจอครัวเป็นระยะ เพื่อให้รายการที่ครัวติ๊กเสร็จแล้วอัปเดตขึ้นหน้านี้เองโดยไม่ต้องกดรีเฟรช
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs = 5000;

  // ---- คิวออเดอร์ (คอลัมน์ซ้าย): ค้นหา + กรองเดือน + แท็บสถานะ ----
  searchQuery = signal('');
  selectedMonth = signal(this.currentMonthValue());
  statusTab = signal<'all' | 'active' | 'closed'>('all');
  selectedOrderId = signal<number | null>(null);

  @ViewChild('monthInput') monthInputRef?: ElementRef<HTMLInputElement>;

  private monthFilteredOrders = computed(() => {
    const month = this.selectedMonth();
    if (!month) return this.allOrders();
    return this.allOrders().filter((o) => o.created_at?.slice(0, 7) === month);
  });

  private tabFilteredOrders = computed(() => {
    const tab = this.statusTab();
    const list = this.monthFilteredOrders();
    if (tab === 'active') return list.filter((o) => o.status === 'open' || o.status === 'preparing' || o.status === 'served');
    if (tab === 'closed') return list.filter((o) => o.status === 'paid' || o.status === 'cancelled');
    return list;
  });

  filteredOrders = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.tabFilteredOrders();
    if (!q) return list;
    return list.filter(
      (o) => this.orderCode(o).toLowerCase().includes(q) || (o.table?.name ?? '').toLowerCase().includes(q)
    );
  });

  selectedOrder = computed<Order | null>(() => {
    const list = this.filteredOrders();
    const id = this.selectedOrderId();
    if (id !== null) {
      const found = list.find((o) => o.id === id);
      if (found) return found;
    }
    return list[0] ?? null;
  });

  // ---- แก้ไขรายการในบิลเดิม (สั่งเพิ่ม / ยกเลิกบางรายการ) — ทำงานกับ selectedOrder() เสมอ ----
  editModeOpen = signal(false);
  categories = signal<Category[]>([]);
  menuItems = signal<MenuItem[]>([]);
  selectedCategoryId = signal<number | null>(null);
  addItemIsTakeaway = false;
  editGuestCount: number | null = null;

  // ---- ย้ายโต๊ะ (ลูกค้านั่งอยู่แล้วอยากย้ายที่นั่ง) ----
  tables = signal<DiningTable[]>([]);
  zones = signal<Zone[]>([]);
  moveTableModalOpen = signal(false);

  availableTablesForMove = computed(() => {
    const inactiveZones = new Set(this.zones().filter((z) => !z.is_active).map((z) => z.name));
    return this.tables().filter((t) => t.status === 'available' && !inactiveZones.has(t.zone));
  });

  tablesByZoneForMove = computed(() => {
    const groups = new Map<string, DiningTable[]>();
    for (const t of this.availableTablesForMove()) {
      const zone = t.zone?.trim() || 'ไม่ระบุโซน';
      if (!groups.has(zone)) {
        groups.set(zone, []);
      }
      groups.get(zone)!.push(t);
    }
    return Array.from(groups.entries()).map(([zone, tables]) => ({ zone, tables }));
  });

  filteredMenuItems = computed(() => {
    const catId = this.selectedCategoryId();
    const items = this.menuItems();
    return catId ? items.filter((m) => m.category_id === catId) : items;
  });

  // กล่องเลือกตัวเลือกเมนู (เช่น ความหวาน) ตอนสั่งเพิ่ม
  optionDialogItem = signal<MenuItem | null>(null);
  optionDialogSelections: Record<number, number> = {};
  optionDialogNote = '';

  // ---- สถานะ "กำลังทำงาน" ของปุ่มต่างๆ ที่เรียก API — key เป็นข้อความ (เช่น "advance-5", "remove-item-12")
  // กันปุ่มนั้นกดซ้ำระหว่างรอ response และผูก [disabled] ที่ปุ่มนั้นโดยเฉพาะ
  private busyKeys = signal<Set<string>>(new Set());

  isBusy(key: string): boolean {
    return this.busyKeys().has(key);
  }

  private setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busyKeys());
    if (busy) next.add(key);
    else next.delete(key);
    this.busyKeys.set(next);
  }

  savingGuestCount = signal(false);
  confirmingOptions = signal(false);

  // ---- ชำระเงินก่อน (popup ในหน้านี้เลย) — ใช้ได้ทั้งบิลนั่งทานและซื้อกลับที่ยังไม่ปิดบิล ไม่ต้องกด
  // "ปิดออเดอร์" ไปหน้าคิดเงินแยกต่างหากก่อน เผื่อลูกค้าอยากจ่ายไว้ล่วงหน้าระหว่างรอทำ/รอเสิร์ฟ
  payingOrder = signal<Order | null>(null);

  // ---- เมนู "⋯" ท้ายแถบปุ่ม (ดีไซน์ 6a) — เก็บ "ยกเลิกบิล" ไว้ในนี้ ต้องกด 2 ครั้งกว่าจะถึง ลดการกดพลาด
  // ข้างปุ่ม "ปิดออเดอร์" ที่เป็นปุ่มหลัก
  moreMenuOpen = signal(false);
  // โมดัลยืนยัน "ยกเลิกบิล" ขนาด S (แทน window.confirm() เดิม) ตามสเปกโมดัลมาตรฐาน 6b
  cancelConfirmOrder = signal<Order | null>(null);
  cancellingOrder = signal(false);

  cancelConfirmServedCount = computed(() => {
    const order = this.cancelConfirmOrder();
    if (!order) return 0;
    return order.items.filter((it) => it.status === 'served').length;
  });

  // เดินสถานะบิลแบบ manual ได้แค่ open -> preparing (กดว่า "เริ่มทำ")
  // ส่วน preparing -> served ตอนนี้ auto ตามสถานะรายชิ้นจากครัวแล้ว (ดู autoSyncOrderStatusFromItems ฝั่ง backend)
  private readonly nextStatusFlow: Record<OrderStatus, OrderStatus | null> = {
    open: 'preparing',
    preparing: null,
    served: null,
    paid: null,
    cancelled: null
  };

  private readonly statusLabels: Record<OrderStatus, string> = {
    open: 'รอทำ',
    preparing: 'กำลังทำ',
    served: 'เสิร์ฟแล้ว',
    paid: 'ปิดออเดอร์',
    cancelled: 'ยกเลิก'
  };

  constructor(
    private orderService: OrderService,
    private menuService: MenuService,
    private tableService: TableService,
    private zoneService: ZoneService,
    private shopSettingsService: ShopSettingsService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.menuService.getCategories().subscribe((cats) => {
      this.categories.set(cats);
      if (cats.length > 0 && !this.selectedCategoryId()) {
        this.selectedCategoryId.set(cats[0].id);
      }
    });
    this.menuService.getMenuItems().subscribe((items) => this.menuItems.set(items));
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
    this.zoneService.getZones().subscribe((zones) => this.zones.set(zones));
    this.shopSettingsService.getShopSettings().subscribe((s) => this.shopSettings.set(s));

    this.pollHandle = setInterval(() => this.refresh(true), this.pollIntervalMs);
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
    }
  }

  private currentMonthValue(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // silent = true ใช้ตอน poll พื้นหลัง (เช็คว่าครัวติ๊กเสร็จรายการไหนแล้วบ้าง) จะได้ไม่ขึ้น
  // "กำลังโหลด..." กระพริบรบกวนหน้าจอทุก 5 วิ
  refresh(silent = false): void {
    if (!silent) {
      this.loading.set(true);
    }
    this.orderService.listOrders().subscribe({
      next: (orders) => {
        this.allOrders.set(orders);
        this.loading.set(false);
        this.loadError.set(false);
      },
      error: () => {
        this.loading.set(false);
        // ไม่ขึ้น error state ตอน poll เงียบๆ พื้นหลัง (silent) กันจอกระพริบ ให้ค้างรายการเดิมไว้ก่อน
        // ขึ้นเฉพาะตอนโหลดครั้งแรก/กดรีเฟรชเองที่ยังไม่มีข้อมูลอะไรอยู่ในมือเลย
        if (!silent) {
          this.loadError.set(true);
        }
      }
    });
  }

  // ปุ่ม "ล้างตัวกรอง" ในสถานะว่าง — เคลียร์คำค้นหา/แท็บ/เดือนกลับเป็นค่าเริ่มต้นทั้งหมด
  clearFilters(): void {
    this.searchQuery.set('');
    this.statusTab.set('all');
    this.selectedMonth.set(this.currentMonthValue());
  }

  // ---- คิวออเดอร์: เลือก/ค้นหา/กรอง ----

  selectOrder(order: Order): void {
    this.selectedOrderId.set(order.id);
    this.editModeOpen.set(false);
  }

  switchTab(tab: 'all' | 'active' | 'closed'): void {
    this.statusTab.set(tab);
  }

  onMonthChange(value: string): void {
    this.selectedMonth.set(value);
  }

  // ปุ่ม "ประวัติเก่า" — เปิด date-picker ของช่องเดือนให้ทันที ให้เลือกย้อนหลังได้เร็วขึ้น (ไม่ต้องคลิกไอคอนเอง)
  openHistoryPicker(): void {
    const el = this.monthInputRef?.nativeElement;
    if (!el) return;
    // showPicker() ยังไม่อยู่ใน lib.dom.d.ts เวอร์ชันที่โปรเจกต์นี้ใช้ (รองรับแค่ browser ใหม่ๆ) เลย cast เป็น any
    const withPicker = el as unknown as { showPicker?: () => void };
    if (typeof withPicker.showPicker === 'function') {
      withPicker.showPicker();
    } else {
      el.focus();
    }
  }

  exportCsv(): void {
    const rows = this.filteredOrders();
    const header = ['เลขออเดอร์', 'วันที่', 'เวลา', 'โต๊ะ', 'ประเภท', 'สถานะ', 'ยอดสุทธิ'];
    const lines = [header.join(',')];
    for (const o of rows) {
      const d = new Date(o.created_at);
      const dateStr = d.toLocaleDateString('th-TH');
      const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const cells = [
        this.orderCode(o),
        dateStr,
        timeStr,
        o.table?.name ?? '-',
        this.orderTypeText(o.order_type),
        this.statusText(o.status),
        String(o.total_amount)
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    }
    const csv = '﻿' + lines.join('\r\n'); // BOM กันปัญหาภาษาไทยเพี้ยนตอนเปิดด้วย Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${this.selectedMonth()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // เลขออเดอร์แบบอ่านง่าย เช่น ORD-20260806-00004 (วันที่เปิดบิล + running id ทับ 5 หลัก)
  orderCode(o: Order): string {
    const d = new Date(o.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `ORD-${y}${m}${day}-${String(o.id).padStart(5, '0')}`;
  }

  itemsSummary(order: Order): string {
    return order.items.map((i) => `${i.quantity}x ${i.menu_item?.name}`).join(', ');
  }

  nextStatus(status: OrderStatus): OrderStatus | null {
    return this.nextStatusFlow[status];
  }

  statusText(status: OrderStatus): string {
    return this.statusLabels[status];
  }

  orderTypeText(orderType: string): string {
    return orderType === 'dine_in' ? 'นั่งทาน' : 'ซื้อกลับ';
  }

  // ปิด/ยกเลิกทำได้เฉพาะบิลที่ยังไม่จบสถานะ (paid/cancelled คือจบแล้ว แก้อะไรต่อไม่ได้)
  isOpenOrder(order: Order): boolean {
    return order.status === 'open' || order.status === 'preparing' || order.status === 'served';
  }

  advance(order: Order): void {
    const next = this.nextStatus(order.status);
    if (!next) return;
    const key = `advance-${order.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.orderService.updateStatus(order.id, next).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'แก้ไขสถานะไม่สำเร็จ');
      }
    });
  }

  // ปุ่ม "ยกเลิก" ในดีไซน์ทำหน้าที่แทนทั้งยกเลิกและ "ลบออเดอร์" (ระบบนี้ไม่มีการลบออเดอร์จริงจาก database)
  // อยู่ในเมนู "⋯" (ดีไซน์ 6a) เปิดโมดัลยืนยันขนาด S แทน window.confirm() เดิม (ดีไซน์ 6b)
  openCancelConfirm(order: Order): void {
    this.moreMenuOpen.set(false);
    this.cancelConfirmOrder.set(order);
  }

  closeCancelConfirm(): void {
    if (this.cancellingOrder()) return;
    this.cancelConfirmOrder.set(null);
  }

  confirmCancelOrder(): void {
    const order = this.cancelConfirmOrder();
    if (!order) return;
    this.cancellingOrder.set(true);
    this.orderService.updateStatus(order.id, 'cancelled').subscribe({
      next: () => {
        this.cancellingOrder.set(false);
        this.cancelConfirmOrder.set(null);
        this.toastService.success('ยกเลิกออเดอร์แล้ว');
        this.refresh();
      },
      error: (err) => {
        this.cancellingOrder.set(false);
        this.toastService.error(err?.error?.error ?? 'ยกเลิกไม่สำเร็จ');
      }
    });
  }

  toggleMoreMenu(): void {
    this.moreMenuOpen.set(!this.moreMenuOpen());
  }

  closeMoreMenu(): void {
    this.moreMenuOpen.set(false);
  }

  printReceipt(): void {
    window.print();
  }

  // ---- ชำระเงินก่อน (popup ในหน้านี้เลย) ----

  openPayNow(order: Order): void {
    // โหลดข้อมูลร้านค้าใหม่ทุกครั้ง (ไม่ cache) กันเลขพร้อมเพย์เก่าค้าง ถ้าแอดมินเพิ่งไปตั้งค่าเลขพร้อมเพย์
    // หลังเปิดหน้านี้ค้างไว้ (โดยไม่รีเฟรชหน้า) — ดู openInvoiceQuote() ด้านล่างที่แก้บั๊กเดียวกัน
    this.shopSettingsService.getShopSettings().subscribe((s) => this.shopSettings.set(s));
    this.payingOrder.set(order);
  }

  closePayNow(): void {
    this.payingOrder.set(null);
  }

  // เรียกจาก <app-payment-panel> ตอนปิดบิลสำเร็จ — ปิด popup แล้วรีเฟรชรายการให้สถานะ/ยอดขึ้นเป็น "ปิดออเดอร์" ทันที
  onPaid(paid: Order): void {
    this.payingOrder.set(null);
    this.toastService.success('ปิดบิลเรียบร้อย');
    this.refresh();
  }

  // ---- ปุ่ม "พิมพ์ใบแจ้งหนี้" ข้าง "ปิดออเดอร์" (เฉพาะบิลที่ยังไม่จ่าย) ----
  // ต่างจาก "พิมพ์ใบเสร็จ" (printReceipt) ตรงที่ยังไม่ใช่เอกสารรับเงินจริง — บิลนี้ยังไม่ปิด ยังไม่มีเลขที่
  // ใบเสร็จวิ่ง (invoice_no) จาก backend (เลขจะออกก็ต่อเมื่อกดปิดบิล/ชำระเงินจริงเท่านั้น) จึงพิมพ์เป็นเอกสาร
  // สรุปยอด+QR ฝั่ง client ล้วนๆ (แบบเดียวกับปุ่ม "พิมพ์ใบแจ้งหนี้ (QR)" ที่หน้า POS ก่อนส่งออเดอร์) ให้ลูกค้า
  // ดูยอด/สแกนจ่ายได้ก่อน โดยไม่ผูกกับเลขที่เอกสารทางบัญชีใดๆ
  invoiceQuoteOrder = signal<Order | null>(null);
  invoiceQrDataUrl = signal<string | null>(null);
  invoiceQrLoading = signal(false);
  // เวลาที่เปิดใบแจ้งหนี้ (ไว้พิมพ์ท้ายเอกสาร) — จับตอนเปิด ไม่ใช่ตอนพิมพ์ กันเวลาขยับถ้าเปิดค้างไว้นาน
  invoiceQuotePrintedAt = new Date();

  openInvoiceQuote(order: Order): void {
    this.invoiceQuoteOrder.set(order);
    this.invoiceQrDataUrl.set(null);
    this.invoiceQuotePrintedAt = new Date();
    // โหลดข้อมูลร้านค้าใหม่ทุกครั้ง (ไม่ cache) — เหตุผลเดียวกับ openPayNow() ด้านบน กันเลขพร้อมเพย์เก่าค้าง
    this.shopSettingsService.getShopSettings().subscribe({
      next: (s) => {
        this.shopSettings.set(s);
        this.buildInvoiceQr(order);
      },
      error: () => {
        // โหลดข้อมูลร้านค้าไม่สำเร็จ — ยังพิมพ์รายการ/ยอดรวมได้ปกติ แค่ไม่มี QR ให้สแกน
      }
    });
  }

  closeInvoiceQuote(): void {
    this.invoiceQuoteOrder.set(null);
  }

  printInvoiceQuote(): void {
    window.print();
  }

  formatInvoiceTimestamp(d: Date): string {
    return formatThaiTimestamp(d);
  }

  // VAT 7% แบบรวมในราคา (ไม่ได้บวกเพิ่ม) — สกัดสัดส่วนภาษีออกมาจากยอดรวมที่ลูกค้าต้องจ่ายจริงเพื่อแสดงในใบแจ้งหนี้
  // เท่านั้น ไม่กระทบยอดที่ต้องชำระ
  vatPortion(total: number): number {
    return (total * 7) / 107;
  }

  private buildInvoiceQr(order: Order): void {
    const shop = this.shopSettings();
    if (!shop?.promptpay_id || order.total_amount <= 0) {
      this.invoiceQrDataUrl.set(null);
      return;
    }
    this.invoiceQrLoading.set(true);
    const payload = generatePromptPayPayload(shop.promptpay_id, order.total_amount);
    toDataURL(payload, { width: 200, margin: 1 })
      .then((url) => {
        this.invoiceQrDataUrl.set(url);
        this.invoiceQrLoading.set(false);
      })
      .catch(() => {
        this.invoiceQrDataUrl.set(null);
        this.invoiceQrLoading.set(false);
      });
  }

  // ---- แก้ไขรายการในบิลเดิม ----

  toggleEditMode(): void {
    if (this.editModeOpen()) {
      this.editModeOpen.set(false);
      return;
    }
    const order = this.selectedOrder();
    if (!order) return;
    this.editGuestCount = order.guest_count || null;
    this.addItemIsTakeaway = false;
    this.editModeOpen.set(true);
  }

  saveGuestCount(): void {
    if (this.savingGuestCount()) return;
    const order = this.selectedOrder();
    if (!order) return;
    if (!this.editGuestCount || this.editGuestCount <= 0) {
      this.toastService.error('กรอกจำนวนคนให้ถูกต้อง');
      return;
    }
    this.savingGuestCount.set(true);
    this.orderService.updateGuestCount(order.id, this.editGuestCount).subscribe({
      next: () => {
        this.savingGuestCount.set(false);
        this.refresh();
      },
      error: (err) => {
        this.savingGuestCount.set(false);
        this.toastService.error(err?.error?.error ?? 'แก้ไขจำนวนคนไม่สำเร็จ');
      }
    });
  }

  // ---- ย้ายโต๊ะ ----

  openMoveTable(): void {
    if (!this.selectedOrder()) return;
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
    this.moveTableModalOpen.set(true);
  }

  closeMoveTable(): void {
    this.moveTableModalOpen.set(false);
  }

  chooseNewTable(tableId: number): void {
    const order = this.selectedOrder();
    if (!order) return;
    const key = `move-table-${tableId}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.orderService.changeTable(order.id, tableId).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.closeMoveTable();
        this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
        this.refresh();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'ย้ายโต๊ะไม่สำเร็จ');
      }
    });
  }

  selectCategory(id: number): void {
    this.selectedCategoryId.set(id);
  }

  addItemToOrder(item: MenuItem): void {
    const order = this.selectedOrder();
    if (!order) return;
    if (item.option_groups && item.option_groups.length > 0) {
      this.openOptionsDialog(item);
      return;
    }

    const key = `add-item-${item.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.orderService
      .addItem(order.id, {
        menu_item_id: item.id,
        quantity: 1,
        note: '',
        is_takeaway: this.addItemIsTakeaway
      })
      .subscribe({
        next: () => {
          this.setBusy(key, false);
          this.refresh();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'เพิ่มรายการไม่สำเร็จ');
        }
      });
  }

  removeItem(itemId: number): void {
    const order = this.selectedOrder();
    if (!order) return;
    const key = `remove-item-${itemId}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.orderService.deleteItem(order.id, itemId).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'ยกเลิกไม่สำเร็จ');
      }
    });
  }

  // ---- กล่องเลือกตัวเลือกเมนู ----

  openOptionsDialog(item: MenuItem): void {
    this.optionDialogItem.set(item);
    this.optionDialogNote = '';
    this.optionDialogSelections = {};
    for (const group of item.option_groups ?? []) {
      const enabledChoices = group.choices.filter((c) => c.is_enabled !== false);
      if (enabledChoices.length === 0) continue;
      const defaultChoice = enabledChoices.find((c) => c.is_default);
      if (defaultChoice) {
        this.optionDialogSelections[group.id] = defaultChoice.id;
      } else if (group.is_required) {
        // บังคับเลือกและไม่มีตัวเลือกไหนตั้งเป็นค่าเริ่มต้นไว้ — เลือกตัวแรกให้อัตโนมัติ (ต้องเลือกอยู่แล้ว)
        // ถ้าไม่บังคับเลือก ต้องปล่อยว่างไว้ ไม่สุ่มเลือกให้ (เช่น "ไข่" เลือกได้อย่างเดียวแต่ไม่บังคับ)
        this.optionDialogSelections[group.id] = enabledChoices[0].id;
      }
    }
  }

  closeOptionsDialog(): void {
    this.optionDialogItem.set(null);
  }

  selectOption(groupId: number, choiceId: number): void {
    this.optionDialogSelections[groupId] = choiceId;
  }

  confirmOptions(): void {
    if (this.confirmingOptions()) return;
    const order = this.selectedOrder();
    const item = this.optionDialogItem();
    if (!order || !item) return;

    const missingRequired = (item.option_groups ?? []).some(
      (g) => g.is_required && !this.optionDialogSelections[g.id]
    );
    if (missingRequired) {
      this.toastService.error('กรุณาเลือกตัวเลือกที่บังคับให้ครบก่อนเพิ่มรายการ');
      return;
    }

    const optionChoiceIds = (item.option_groups ?? [])
      .filter((g) => this.optionDialogSelections[g.id])
      .map((g) => this.optionDialogSelections[g.id]);

    this.confirmingOptions.set(true);
    this.orderService
      .addItem(order.id, {
        menu_item_id: item.id,
        quantity: 1,
        note: this.optionDialogNote,
        option_choice_ids: optionChoiceIds,
        is_takeaway: this.addItemIsTakeaway
      })
      .subscribe({
        next: () => {
          this.confirmingOptions.set(false);
          this.closeOptionsDialog();
          this.refresh();
        },
        error: (err) => {
          this.confirmingOptions.set(false);
          this.toastService.error(err?.error?.error ?? 'เพิ่มรายการไม่สำเร็จ');
        }
      });
  }
}
