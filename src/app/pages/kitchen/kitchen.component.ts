import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrderService } from '../../core/order.service';
import { Order, OrderItem, OrderItemStatus } from '../../core/models';

// เมนู 1 รายการ พร้อมอ้างอิงกลับไปที่บิล/โต๊ะที่มันสังกัดอยู่ — ใช้เป็นหน่วยการ์ดในบอร์ด 3 คอลัมน์
interface KitchenCard {
  order: Order;
  item: OrderItem;
}

// ชุดสี "ป้ายชื่อบิล" วนซ้ำ 6 สี (ดีไซน์ 8b) — คนละชุดกับสีสถานะคอลัมน์ (แดง/เหลือง/เขียว) ใช้แค่แยกแยะ
// ว่าการ์ดไหนเป็นบิลเดียวกัน ไม่ได้สื่อความหมายสถานะ จึงเลือกโทนที่ต่างจากสีสถานะชัดเจน
interface BillColor {
  border: string;
  badgeBg: string;
  badgeText: string;
}

const BILL_COLORS: BillColor[] = [
  { border: '#7B4FA8', badgeBg: '#F1EAF8', badgeText: '#6B3F97' }, // ม่วง
  { border: '#2A7BB8', badgeBg: '#E4F0F9', badgeText: '#1F5F8F' }, // ฟ้า
  { border: '#6B7A2A', badgeBg: '#EEF1DE', badgeText: '#55611F' }, // เขียวมะกอก
  { border: '#8A5A2E', badgeBg: '#F3E7D9', badgeText: '#6E4623' }, // น้ำตาล
  { border: '#C25B8C', badgeBg: '#FBE6EF', badgeText: '#9E3F6B' }, // ชมพู
  { border: '#5C5A55', badgeBg: '#EFECE5', badgeText: '#45433E' } // เทาเข้ม
];

// จอครัวแบบบอร์ด 3 คอลัมน์ (เข้าใหม่ / กำลังทำ / เสิร์ฟแล้ว) ตามดีไซน์ต้นแบบ (DotPOS มี 4 คอลัมน์ คือแยก
// "รับแล้ว" ออกจาก "เข้าใหม่" และ "พร้อมเสิร์ฟ" ออกจาก "เสิร์ฟแล้ว" แต่ระบบนี้เก็บสถานะรายเมนูแค่ 3 แบบ
// pending/preparing/served จึงยุบเหลือ 3 คอลัมน์แทน ไม่เพิ่ม status ใหม่ที่ backend)
// ทำงาน "ระดับรายเมนู" เหมือนเดิม — แต่ละเมนูในบิลขยับสถานะเป็นอิสระของตัวเอง ไม่ผูกไปกับเมนูอื่นในบิลเดียวกัน
// (การ์ด 1 ใบ = เมนู 1 รายการ ไม่ใช่ 1 บิล เพราะบิลเดียวอาจมีเมนูอยู่คนละคอลัมน์พร้อมกันได้)
@Component({
  selector: 'app-kitchen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kitchen.component.html',
  styleUrl: './kitchen.component.scss'
})
export class KitchenComponent implements OnInit, OnDestroy {
  orders = signal<Order[]>([]);
  loading = signal(false);
  // true เมื่อโหลดออเดอร์ล่าสุดไม่สำเร็จ — โชว์กล่องแดง + ปุ่ม "ลองอีกครั้ง" (ดีไซน์ 6b)
  loadError = signal(false);

  // เก็บ id ของรายการที่กำลังส่งอัปเดตอยู่ กันกดซ้ำ/โชว์สถานะกำลังบันทึก
  updatingItemIds = signal<Set<number>>(new Set());

  // นาฬิกาไว้คำนวณ "ส่งมากี่นาทีแล้ว" แบบขยับเองเรื่อยๆ โดยไม่ต้องรอ refresh ข้อมูลใหม่จาก backend
  private now = signal(Date.now());
  private clockHandle: ReturnType<typeof setInterval> | null = null;

  pendingCards = computed(() => this.cardsByStatus('pending'));
  preparingCards = computed(() => this.cardsByStatus('preparing'));
  servedCards = computed(() => this.cardsByStatus('served'));

  // จำนวนรายการที่ยังไม่เสิร์ฟและรอเกิน 15 นาที — โชว์เป็นป้ายเตือนที่หัวจอ (ดีไซน์ 4b)
  overdueCount = computed(
    () => [...this.pendingCards(), ...this.preparingCards()].filter((c) => this.minutesAgo(c.order) >= 15).length
  );

  // เวลาปัจจุบัน HH:mm โชว์คู่กับข้อความ "อัปเดตอัตโนมัติทุก..." ที่หัวจอ — ขยับเองทุก 30 วิตาม this.now()
  nowText = computed(() => {
    const d = new Date(this.now());
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  constructor(private orderService: OrderService) {}

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

  // รวมเมนูทุกใบที่มีสถานะตรงกับที่ขอ จากทุกออเดอร์ที่กำลังเปิดอยู่ เรียงบิลที่สั่งมาล่าสุดไว้บนสุด
  private cardsByStatus(status: OrderItemStatus): KitchenCard[] {
    const cards: KitchenCard[] = [];
    for (const order of this.orders()) {
      for (const item of order.items) {
        if (item.status === status) {
          cards.push({ order, item });
        }
      }
    }
    return cards.sort((a, b) => this.orderTimeMs(b.order) - this.orderTimeMs(a.order));
  }

  // เลขออเดอร์แบบอ่านง่าย เช่น ORD-20260806-00004 (รูปแบบเดียวกับหน้าออเดอร์/ใบเสร็จ)
  orderCode(order: Order): string {
    const d = new Date(order.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `ORD-${y}${m}${day}-${String(order.id).padStart(5, '0')}`;
  }

  // ส่งมากี่นาทีแล้ว นับจากตอนสร้างออเดอร์ถึงตอนนี้ (this.now() ทำให้ค่านี้ขยับเองทุก 30 วิ)
  minutesAgo(order: Order): number {
    const diffMs = this.now() - this.orderTimeMs(order);
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  refresh(): void {
    this.loading.set(true);
    this.orderService.listOrders('open,preparing,served').subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
        this.loadError.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      }
    });
  }

  orderTypeText(orderType: string): string {
    return orderType === 'dine_in' ? 'นั่งทาน' : 'ซื้อกลับ';
  }

  isUpdating(itemId: number): boolean {
    return this.updatingItemIds().has(itemId);
  }

  itemOptionsLabel(item: OrderItem): string {
    return (item.options ?? []).map((o) => o.choice_name).join(', ');
  }

  // ตัวเลือกย่อยของเมนู ต่อกันแบบ "+ เผ็ดมาก · + ไข่ดาว" ตามดีไซน์ 4b
  optionsSummary(item: OrderItem): string {
    return (item.options ?? []).map((o) => `+ ${o.choice_name}`).join(' · ');
  }

  tableLabel(order: Order): string {
    if (order.table) return `โต๊ะ ${order.table.name}`;
    return order.order_type === 'dine_in' ? 'โต๊ะ -' : 'ซื้อกลับ';
  }

  // สีประจำบิล (ดีไซน์ 8b) — วนตาม order.id ให้บิลเดียวกันได้สีเดิมเสมอไม่ว่าเมนูจะกระจายอยู่คอลัมน์ไหน
  billColor(order: Order): BillColor {
    return BILL_COLORS[order.id % BILL_COLORS.length];
  }

  // เรียงเมนูในบิลตาม id (ลำดับที่สั่งเข้ามา) ให้เลข "N ใน M" คงที่ไม่ขยับไปมาตามสถานะที่เปลี่ยน
  private orderItemsSorted(order: Order): OrderItem[] {
    return [...order.items].sort((a, b) => a.id - b.id);
  }

  // ป้าย "N ใน M" บอกว่าเมนูนี้เป็นชิ้นที่เท่าไหร่ของบิล ทั้งบิลมีกี่ชิ้น (ดีไซน์ 8b)
  posInOrderLabel(order: Order, item: OrderItem): string {
    const sorted = this.orderItemsSorted(order);
    const index = sorted.findIndex((i) => i.id === item.id);
    return `${index + 1} ใน ${sorted.length}`;
  }

  // บิลนี้ยังมีเมนูอื่นที่ยังไม่เริ่มทำ (pending) ค้างอยู่กี่รายการ — โชว์เตือนที่การ์ดคอลัมน์ "กำลังทำ" เท่านั้น
  // (ดีไซน์ 8b) ให้ครัวรู้ว่ายังมีของบิลเดียวกันรออยู่ แม้เมนูนี้จะเริ่มทำไปก่อนแล้ว
  pendingSiblingsCount(order: Order, item: OrderItem): number {
    return order.items.filter((i) => i.id !== item.id && i.status === 'pending').length;
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
