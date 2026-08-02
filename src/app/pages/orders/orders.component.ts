import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { OrderService } from '../../core/order.service';
import { MenuService } from '../../core/menu.service';
import { Category, MenuItem, Order, OrderStatus } from '../../core/models';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnInit, OnDestroy {
  orders = signal<Order[]>([]);
  loading = signal(false);

  // เช็คสถานะกับจอครัวเป็นระยะ เพื่อให้รายการที่ครัวติ๊กเสร็จแล้วอัปเดตขึ้นหน้านี้เองโดยไม่ต้องกดรีเฟรช
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs = 5000;

  // ---- แก้ไขรายการในบิลเดิม (สั่งเพิ่ม / ยกเลิกบางรายการ) ----
  expandedOrderId = signal<number | null>(null);
  categories = signal<Category[]>([]);
  menuItems = signal<MenuItem[]>([]);
  selectedCategoryId = signal<number | null>(null);
  editMessage = signal<string | null>(null);
  // ติ๊กไว้เมื่อรายการที่กำลังจะสั่งเพิ่มนี้ อยากให้เป็นกลับบ้าน (ใช้กับบิลนั่งทานเท่านั้น)
  addItemIsTakeaway = false;
  // จำนวนคนที่มา แก้ไขได้จาก popup นี้ (ตั้งค่าเริ่มต้นจากออเดอร์ปัจจุบันทุกครั้งที่เปิด popup)
  editGuestCount: number | null = null;

  filteredMenuItems = computed(() => {
    const catId = this.selectedCategoryId();
    const items = this.menuItems();
    return catId ? items.filter((m) => m.category_id === catId) : items;
  });

  // ออเดอร์ที่กำลังเปิด popup แก้ไขรายการอยู่ (หาใหม่จาก orders() ทุกครั้งที่ refresh
  // เพื่อให้ popup แสดงข้อมูลล่าสุดหลังเพิ่ม/ลบรายการ)
  editingOrder = computed(() => {
    const id = this.expandedOrderId();
    if (id === null) return null;
    return this.orders().find((o) => o.id === id) ?? null;
  });

  // กล่องเลือกตัวเลือกเมนู (เช่น ความหวาน) ตอนสั่งเพิ่ม
  optionDialogOrder = signal<Order | null>(null);
  optionDialogItem = signal<MenuItem | null>(null);
  optionDialogSelections: Record<number, number> = {};
  optionDialogNote = '';

  // เดินสถานะบิลแบบ manual ได้แค่ open -> preparing (กดว่า "กำลังเริ่มทำ")
  // ส่วน preparing -> served ตอนนี้ auto ตามสถานะรายชิ้นจากครัวแล้ว (ดู autoSyncOrderStatusFromItems ฝั่ง backend)
  // จึงไม่ต้องมีปุ่มให้กดเลื่อนเองอีก
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
    paid: 'ชำระแล้ว',
    cancelled: 'ยกเลิก'
  };

  constructor(
    private orderService: OrderService,
    private menuService: MenuService
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

    this.pollHandle = setInterval(() => this.refresh(true), this.pollIntervalMs);
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
    }
  }

  // silent = true ใช้ตอน poll พื้นหลัง (เช็คว่าครัวติ๊กเสร็จรายการไหนแล้วบ้าง) จะได้ไม่ขึ้น
  // "กำลังโหลด..." กระพริบรบกวนหน้าจอทุก 5 วิ
  refresh(silent = false): void {
    if (!silent) {
      this.loading.set(true);
    }
    this.orderService.listOrders('open,preparing,served').subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
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

  advance(order: Order): void {
    const next = this.nextStatus(order.status);
    if (!next) return;
    this.orderService.updateStatus(order.id, next).subscribe(() => this.refresh());
  }

  cancel(order: Order): void {
    this.orderService.updateStatus(order.id, 'cancelled').subscribe(() => this.refresh());
  }

  // ---- แก้ไขรายการในบิลเดิม ----

  openEdit(order: Order): void {
    this.expandedOrderId.set(order.id);
    this.editMessage.set(null);
    this.addItemIsTakeaway = false;
    this.editGuestCount = order.guest_count || null;
  }

  closeEdit(): void {
    this.expandedOrderId.set(null);
    this.editMessage.set(null);
  }

  saveGuestCount(order: Order): void {
    if (!this.editGuestCount || this.editGuestCount <= 0) {
      this.editMessage.set('กรอกจำนวนคนให้ถูกต้อง');
      return;
    }
    this.orderService.updateGuestCount(order.id, this.editGuestCount).subscribe({
      next: () => {
        this.editMessage.set(null);
        this.refresh();
      },
      error: (err) => this.editMessage.set(err?.error?.error ?? 'แก้ไขจำนวนคนไม่สำเร็จ')
    });
  }

  selectCategory(id: number): void {
    this.selectedCategoryId.set(id);
  }

  addItemToOrder(order: Order, item: MenuItem): void {
    if (item.option_groups && item.option_groups.length > 0) {
      this.openOptionsDialog(order, item);
      return;
    }

    this.orderService
      .addItem(order.id, {
        menu_item_id: item.id,
        quantity: 1,
        note: '',
        is_takeaway: this.addItemIsTakeaway
      })
      .subscribe({
        next: () => {
          this.editMessage.set(null);
          this.refresh();
        },
        error: (err) => this.editMessage.set(err?.error?.error ?? 'เพิ่มรายการไม่สำเร็จ')
      });
  }

  removeItem(order: Order, itemId: number): void {
    this.orderService.deleteItem(order.id, itemId).subscribe({
      next: () => {
        this.editMessage.set(null);
        this.refresh();
      },
      error: (err) => this.editMessage.set(err?.error?.error ?? 'ยกเลิกไม่สำเร็จ')
    });
  }

  // ---- กล่องเลือกตัวเลือกเมนู ----

  openOptionsDialog(order: Order, item: MenuItem): void {
    this.optionDialogOrder.set(order);
    this.optionDialogItem.set(item);
    this.optionDialogNote = '';
    this.optionDialogSelections = {};
    for (const group of item.option_groups ?? []) {
      if (group.choices.length > 0) {
        this.optionDialogSelections[group.id] = group.choices[0].id;
      }
    }
  }

  closeOptionsDialog(): void {
    this.optionDialogOrder.set(null);
    this.optionDialogItem.set(null);
  }

  selectOption(groupId: number, choiceId: number): void {
    this.optionDialogSelections[groupId] = choiceId;
  }

  confirmOptions(): void {
    const order = this.optionDialogOrder();
    const item = this.optionDialogItem();
    if (!order || !item) return;

    const missingRequired = (item.option_groups ?? []).some(
      (g) => g.is_required && !this.optionDialogSelections[g.id]
    );
    if (missingRequired) {
      this.editMessage.set('กรุณาเลือกตัวเลือกที่บังคับให้ครบก่อนเพิ่มรายการ');
      return;
    }

    const optionChoiceIds = (item.option_groups ?? [])
      .filter((g) => this.optionDialogSelections[g.id])
      .map((g) => this.optionDialogSelections[g.id]);

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
          this.editMessage.set(null);
          this.closeOptionsDialog();
          this.refresh();
        },
        error: (err) => this.editMessage.set(err?.error?.error ?? 'เพิ่มรายการไม่สำเร็จ')
      });
  }
}
