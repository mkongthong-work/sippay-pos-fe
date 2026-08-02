import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrderService } from '../../core/order.service';
import { Order, OrderItem, OrderItemStatus } from '../../core/models';

type KitchenTab = 'active' | 'done';

// สถานีที่ไม่ได้ตั้งค่าไว้ (หมวดหมู่ไม่มี station หรือ preload ไม่ติดมา) ให้ตกกลุ่มนี้แทนที่จะหายไปเงียบๆ
const UNASSIGNED_STATION = 'ไม่ระบุสถานี';

interface StationGroup {
  station: string;
  items: OrderItem[];
}

@Component({
  selector: 'app-kitchen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kitchen.component.html'
})
export class KitchenComponent implements OnInit, OnDestroy {
  orders = signal<Order[]>([]);
  loading = signal(false);

  // แท็บ "กำลังทำ" รวมออเดอร์ที่ยังไม่เริ่มทำ (pending ล้วน) กับที่กำลังทำอยู่เข้าด้วยกัน
  // ออเดอร์/รายการใหม่ที่เพิ่งสั่งเพิ่มเข้ามาจะเป็น pending เสมอ จึงตกอยู่แท็บนี้โดยอัตโนมัติ
  activeTab = signal<KitchenTab>('active');

  // เก็บ id ของรายการที่กำลังส่งอัปเดตอยู่ กันกดซ้ำ/โชว์สถานะกำลังบันทึก
  updatingItemIds = signal<Set<number>>(new Set());

  // นาฬิกาไว้คำนวณ "ส่งมากี่นาทีแล้ว" แบบขยับเองเรื่อยๆ โดยไม่ต้องรอ refresh ข้อมูลใหม่จาก backend
  private now = signal(Date.now());
  private clockHandle: ReturnType<typeof setInterval> | null = null;

  // ออเดอร์ที่ยังมีรายการค้างอยู่ (ยังไม่เริ่มทำ หรือกำลังทำ) — แสดงในแท็บ "กำลังทำ"
  // เรียงเอาออเดอร์ที่เพิ่งส่งมาล่าสุดไว้บนสุดเสมอ
  activeOrders = computed(() =>
    this.orders()
      .filter((o) => this.pendingCount(o) > 0)
      .sort((a, b) => this.orderTimeMs(b) - this.orderTimeMs(a))
  );

  // ออเดอร์ที่ทุกรายการเสิร์ฟครบแล้ว — แสดงในแท็บ "เสร็จทั้งหมด" (เรียงล่าสุดไว้บนสุดเช่นกัน)
  doneOrders = computed(() =>
    this.orders()
      .filter((o) => this.pendingCount(o) === 0)
      .sort((a, b) => this.orderTimeMs(b) - this.orderTimeMs(a))
  );

  // รายการที่จะแสดงตามแท็บที่เลือกอยู่
  visibleOrders = computed(() =>
    this.activeTab() === 'active' ? this.activeOrders() : this.doneOrders()
  );

  constructor(private orderService: OrderService) {}

  selectTab(tab: KitchenTab): void {
    this.activeTab.set(tab);
  }

  ngOnInit(): void {
    this.refresh();
    // อัปเดตทุก 30 วิให้ตัวเลข "กี่นาทีที่แล้ว" ขยับแม้ไม่มีการดึงข้อมูลใหม่
    this.clockHandle = setInterval(() => this.now.set(Date.now()), 30000);
  }

  ngOnDestroy(): void {
    if (this.clockHandle !== null) {
      clearInterval(this.clockHandle);
    }
  }

  private orderTimeMs(order: Order): number {
    return new Date(order.created_at).getTime();
  }

  // เวลาส่งออเดอร์มาที่ครัว แสดงเป็น HH:mm
  sentAtLabel(order: Order): string {
    const date = new Date(order.created_at);
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ส่งมากี่นาทีแล้ว นับจากตอนสร้างออเดอร์ถึงตอนนี้ (this.now() ทำให้ค่านี้ขยับเองทุก 30 วิ)
  minutesAgo(order: Order): number {
    const diffMs = this.now() - this.orderTimeMs(order);
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  // จัดกลุ่มรายการในออเดอร์เดียวกันตามสถานีที่ทำ (ครัว/บาร์/อื่นๆ) เพื่อให้เห็นชัดว่าใครทำอะไรบ้าง
  // เผื่ออนาคตอยากแยกส่งไปแต่ละจอ/สถานีจริงๆ ก็ต่อยอดจาก grouping นี้ได้เลย
  itemsByStation(order: Order): StationGroup[] {
    const groups = new Map<string, OrderItem[]>();
    for (const item of order.items) {
      const station = item.menu_item?.category?.station?.trim() || UNASSIGNED_STATION;
      if (!groups.has(station)) {
        groups.set(station, []);
      }
      groups.get(station)!.push(item);
    }
    return Array.from(groups.entries()).map(([station, items]) => ({ station, items }));
  }

  refresh(): void {
    this.loading.set(true);
    this.orderService.listOrders('open,preparing,served').subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  orderTypeText(orderType: string): string {
    return orderType === 'dine_in' ? 'นั่งทาน' : 'ซื้อกลับ';
  }

  isUpdating(itemId: number): boolean {
    return this.updatingItemIds().has(itemId);
  }

  pendingCount(order: Order): number {
    return order.items.filter((it) => it.status !== 'served').length;
  }

  itemOptionsLabel(item: OrderItem): string {
    return (item.options ?? []).map((o) => o.choice_name).join(', ');
  }

  // เริ่มทำเมนูนี้ (รอ -> กำลังทำ) — สถานะบิลโดยรวมจะขยับตามอัตโนมัติที่ backend
  startItem(order: Order, item: OrderItem): void {
    this.setItemStatus(order, item, 'preparing');
  }

  // ทำเสร็จแล้ว (-> เสิร์ฟแล้ว) ล็อกไม่ให้แก้จำนวน/ยกเลิกที่หน้าออเดอร์อีก
  finishItem(order: Order, item: OrderItem): void {
    this.setItemStatus(order, item, 'served');
  }

  // เผื่อกดพลาด ย้อนสถานะกลับ 1 ขั้น
  revertItem(order: Order, item: OrderItem): void {
    const prevStatus: OrderItemStatus = item.status === 'served' ? 'preparing' : 'pending';
    this.setItemStatus(order, item, prevStatus);
  }

  private setItemStatus(order: Order, item: OrderItem, status: OrderItemStatus): void {
    if (this.isUpdating(item.id)) return;

    const updating = new Set(this.updatingItemIds());
    updating.add(item.id);
    this.updatingItemIds.set(updating);

    this.orderService.updateItem(order.id, item.id, { status }).subscribe({
      next: () => {
        // อัปเดตค่าในหน่วยความจำทันทีโดยไม่ต้องรอ refresh ทั้งหน้า
        this.orders.set(
          this.orders().map((o) =>
            o.id !== order.id
              ? o
              : {
                  ...o,
                  items: o.items.map((it) => (it.id === item.id ? { ...it, status } : it))
                }
          )
        );
        const stillUpdating = new Set(this.updatingItemIds());
        stillUpdating.delete(item.id);
        this.updatingItemIds.set(stillUpdating);
      },
      error: () => {
        const stillUpdating = new Set(this.updatingItemIds());
        stillUpdating.delete(item.id);
        this.updatingItemIds.set(stillUpdating);
      }
    });
  }
}
