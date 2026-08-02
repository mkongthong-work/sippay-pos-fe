import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MenuService } from '../../core/menu.service';
import { TableService } from '../../core/table.service';
import { CreateOrderItemInput, OrderService } from '../../core/order.service';
import { Category, DiningTable, MenuItem, Order, OrderType } from '../../core/models';

interface SelectedOption {
  groupId: number;
  groupName: string;
  choiceId: number;
  choiceName: string;
  priceDelta: number;
}

interface CartLine {
  lineId: number;
  menuItem: MenuItem;
  quantity: number;
  note: string;
  selectedOptions: SelectedOption[];
  // ใช้ตอนนั่งทานที่โต๊ะ (orderType='dine_in') แต่บางรายการอยากสั่งกลับบ้านด้วย อยู่บิลเดียวกัน
  isTakeaway: boolean;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss'
})
export class PosComponent implements OnInit {
  categories = signal<Category[]>([]);
  menuItems = signal<MenuItem[]>([]);
  tables = signal<DiningTable[]>([]);
  cart = signal<CartLine[]>([]);

  selectedCategoryId = signal<number | null>(null);
  submitting = signal(false);
  message = signal<string | null>(null);

  // ฟิลด์ธรรมดา ไม่ใช่ signal เพราะผูกกับ ngModel โดยตรง
  orderType: OrderType = 'dine_in';
  selectedTableId: number | null = null;
  // จำนวนคนที่มา (เฉพาะนั่งทาน) ไม่บังคับกรอก แค่เตือนถ้าเกินที่นั่งของโต๊ะ ไม่ได้บล็อกการสั่ง
  guestCount: number | null = null;

  // ---- กล่องเลือกตัวเลือกเมนู (เช่น ความหวาน) เปิดจากการ์ดสินค้าโดยตรง ----
  // หมายเหตุ: ไม่มีช่องโน้ตในกล่องนี้แล้ว ถ้าอยากใส่โน้ตให้ไปใส่ที่ช่องโน้ตของแต่ละรายการใน "บิลปัจจุบัน"
  // ถ้า editingLineId มีค่า แปลว่ากำลังแก้ไขตัวเลือกของรายการที่เพิ่มไปแล้วในบิล (ไม่ใช่เพิ่มรายการใหม่)
  optionDialogItem = signal<MenuItem | null>(null);
  optionDialogSelections: Record<number, number> = {};
  editingLineId = signal<number | null>(null);

  // ---- popup ตรวจสอบรายการก่อนส่งออเดอร์จริง ----
  reviewOpen = signal(false);

  // ---- popup โชว์เลขออเดอร์หลังส่งสำเร็จ (เฉพาะออเดอร์ซื้อกลับ) ----
  takeawayResult = signal<Order | null>(null);

  private nextLineId = 1;

  filteredMenuItems = computed(() => {
    const catId = this.selectedCategoryId();
    const items = this.menuItems();
    return catId ? items.filter((m) => m.category_id === catId) : items;
  });

  cartTotal = computed(() =>
    this.cart().reduce((sum, line) => sum + this.lineUnitPrice(line) * line.quantity, 0)
  );

  availableTables = computed(() => this.tables().filter((t) => t.status === 'available'));

  constructor(
    private menuService: MenuService,
    private tableService: TableService,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    this.menuService.getCategories().subscribe((cats) => {
      this.categories.set(cats);
      if (cats.length > 0) {
        this.selectedCategoryId.set(cats[0].id);
      }
    });
    this.menuService.getMenuItems().subscribe((items) => this.menuItems.set(items));
    this.refreshTables();
  }

  refreshTables(): void {
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
  }

  selectCategory(id: number): void {
    this.selectedCategoryId.set(id);
  }

  addToCart(item: MenuItem): void {
    if (item.option_groups && item.option_groups.length > 0) {
      this.openOptionsDialog(item);
      return;
    }

    const current = this.cart();
    const existing = current.find(
      (line) => line.menuItem.id === item.id && line.selectedOptions.length === 0
    );
    if (existing) {
      this.cart.set(
        current.map((line) =>
          line.lineId === existing.lineId ? { ...line, quantity: line.quantity + 1 } : line
        )
      );
    } else {
      this.cart.set([
        ...current,
        {
          lineId: this.nextLineId++,
          menuItem: item,
          quantity: 1,
          note: '',
          selectedOptions: [],
          isTakeaway: false
        }
      ]);
    }
  }

  changeQuantity(lineId: number, delta: number): void {
    const updated = this.cart()
      .map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + delta } : line))
      .filter((line) => line.quantity > 0);
    this.cart.set(updated);
  }

  // สลับว่ารายการนี้อยากสั่งกลับบ้านไหม (ใช้เมื่อ orderType เป็นนั่งทาน แต่มีบางรายการอยากซื้อกลับด้วย)
  toggleLineTakeaway(lineId: number): void {
    this.cart.set(
      this.cart().map((line) => (line.lineId === lineId ? { ...line, isTakeaway: !line.isTakeaway } : line))
    );
  }

  clearCart(): void {
    this.cart.set([]);
  }

  lineUnitPrice(line: CartLine): number {
    const optionsTotal = line.selectedOptions.reduce((sum, o) => sum + o.priceDelta, 0);
    return line.menuItem.price + optionsTotal;
  }

  lineOptionsLabel(line: CartLine): string {
    return line.selectedOptions.map((o) => o.choiceName).join(', ');
  }

  // ---- กล่องเลือกตัวเลือกเมนู ----

  openOptionsDialog(item: MenuItem): void {
    this.optionDialogItem.set(item);
    this.optionDialogSelections = {};
    for (const group of item.option_groups ?? []) {
      if (group.choices.length > 0) {
        this.optionDialogSelections[group.id] = group.choices[0].id;
      }
    }
  }

  closeOptionsDialog(): void {
    this.optionDialogItem.set(null);
    this.editingLineId.set(null);
  }

  selectOption(groupId: number, choiceId: number): void {
    this.optionDialogSelections[groupId] = choiceId;
  }

  // เปิดกล่องตัวเลือกอีกครั้งเพื่อแก้ไขรายการที่เพิ่มไปแล้วในบิล (ไม่ใช่เพิ่มรายการใหม่)
  editLine(line: CartLine): void {
    if (!line.menuItem.option_groups || line.menuItem.option_groups.length === 0) return;

    this.optionDialogItem.set(line.menuItem);
    this.optionDialogSelections = {};
    for (const opt of line.selectedOptions) {
      this.optionDialogSelections[opt.groupId] = opt.choiceId;
    }
    this.editingLineId.set(line.lineId);
  }

  confirmOptions(): void {
    const item = this.optionDialogItem();
    if (!item) return;

    const missingRequired = (item.option_groups ?? []).some(
      (g) => g.is_required && !this.optionDialogSelections[g.id]
    );
    if (missingRequired) {
      this.message.set('กรุณาเลือกตัวเลือกที่บังคับให้ครบก่อนเพิ่มลงบิล');
      return;
    }

    const selectedOptions: SelectedOption[] = (item.option_groups ?? [])
      .filter((g) => this.optionDialogSelections[g.id])
      .map((g) => {
        const choiceId = this.optionDialogSelections[g.id];
        const choice = g.choices.find((c) => c.id === choiceId)!;
        return {
          groupId: g.id,
          groupName: g.name,
          choiceId: choice.id,
          choiceName: choice.name,
          priceDelta: choice.price_delta
        };
      });

    const editingId = this.editingLineId();
    if (editingId !== null) {
      // แก้ไขตัวเลือกของรายการเดิม คงจำนวน/โน้ตไว้เหมือนเดิม
      this.cart.set(
        this.cart().map((line) => (line.lineId === editingId ? { ...line, selectedOptions } : line))
      );
    } else {
      this.cart.set([
        ...this.cart(),
        {
          lineId: this.nextLineId++,
          menuItem: item,
          quantity: 1,
          note: '',
          selectedOptions,
          isTakeaway: false
        }
      ]);
    }

    this.message.set(null);
    this.closeOptionsDialog();
  }

  // เดิม submitOrder() ยิง API ทันที ตอนนี้แยกเป็น 2 ขั้น: เปิด popup ให้ตรวจรายการก่อน (openReview)
  // แล้วค่อยยืนยันจริงจาก popup (confirmSubmitOrder) เพื่อกันสั่งผิด/ลืมเช็ครายการ
  openReview(): void {
    const lines = this.cart();
    if (lines.length === 0) {
      this.message.set('กรุณาเลือกรายการอาหารก่อน');
      return;
    }
    if (this.orderType === 'dine_in' && !this.selectedTableId) {
      this.message.set('กรุณาเลือกโต๊ะสำหรับออเดอร์นั่งทาน');
      return;
    }
    this.message.set(null);
    this.reviewOpen.set(true);
  }

  closeReview(): void {
    this.reviewOpen.set(false);
  }

  selectedTableLabel(): string {
    const table = this.tables().find((t) => t.id === this.selectedTableId);
    return table ? `${table.name} (${table.zone})` : '-';
  }

  // เตือนเฉยๆ (ไม่บังคับ) ถ้าจำนวนคนที่กรอกเกินจำนวนที่นั่งของโต๊ะที่เลือกไว้
  guestCountWarning(): string | null {
    const table = this.tables().find((t) => t.id === this.selectedTableId);
    if (!table || !table.capacity || !this.guestCount) return null;
    if (this.guestCount > table.capacity) {
      return `เกินจำนวนที่นั่งของโต๊ะนี้ (นั่งได้ ${table.capacity} คน)`;
    }
    return null;
  }

  confirmSubmitOrder(): void {
    const lines = this.cart();

    const items: CreateOrderItemInput[] = lines.map((line) => ({
      menu_item_id: line.menuItem.id,
      quantity: line.quantity,
      note: line.note,
      option_choice_ids: line.selectedOptions.map((o) => o.choiceId),
      is_takeaway: line.isTakeaway
    }));

    this.submitting.set(true);
    this.message.set(null);

    const orderType = this.orderType;

    this.orderService
      .createOrder({
        order_type: orderType,
        table_id: orderType === 'dine_in' ? this.selectedTableId! : undefined,
        guest_count: orderType === 'dine_in' && this.guestCount ? this.guestCount : undefined,
        items
      })
      .subscribe({
        next: (createdOrder) => {
          this.submitting.set(false);
          this.reviewOpen.set(false);
          this.clearCart();
          this.selectedTableId = null;
          this.guestCount = null;
          this.refreshTables();

          if (orderType === 'takeaway') {
            // ออเดอร์ซื้อกลับ ต้องมีเลขให้บอกลูกค้าไว้รอรับของ เลยขึ้น popup ใหญ่แทนข้อความเล็กๆ
            this.takeawayResult.set(createdOrder);
          } else {
            this.message.set('ส่งออเดอร์เรียบร้อย');
          }
        },
        error: (err) => {
          this.submitting.set(false);
          this.message.set(err?.error?.error ?? 'ส่งออเดอร์ไม่สำเร็จ');
        }
      });
  }

  closeTakeawayResult(): void {
    this.takeawayResult.set(null);
  }
}
