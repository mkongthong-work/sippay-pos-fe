import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toDataURL } from 'qrcode';

import { MenuService } from '../../core/menu.service';
import { TableService } from '../../core/table.service';
import { ZoneService } from '../../core/zone.service';
import { ReservationService } from '../../core/reservation.service';
import { CreateOrderItemInput, OrderService } from '../../core/order.service';
import { ShopSettingsService } from '../../core/shop-settings.service';
import { ToastService } from '../../core/toast.service';
import { generatePromptPayPayload } from '../../core/promptpay';
import { formatThaiTimestamp } from '../../core/thai-date';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { PaymentPanelComponent } from '../../shared/payment-panel/payment-panel.component';
import {
  Category,
  DiningTable,
  MenuItem,
  MenuOptionGroup,
  Order,
  OrderType,
  Reservation,
  ShopSettings,
  Zone
} from '../../core/models';

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

// บิลที่ "พักไว้" — เก็บสถานะบิลที่กำลังทำอยู่ไว้ทั้งหมด (ยังไม่ได้ส่งเป็นออเดอร์จริง) เพื่อสลับไปรับบิลอื่นก่อนแล้วค่อยกลับมาทำต่อ
// เก็บไว้ที่ localStorage ของเครื่อง POS นี้เท่านั้น (ยังไม่ใช่ออเดอร์จริงในระบบ backend จนกว่าจะกด "ส่งออเดอร์")
interface HeldCart {
  id: string;
  heldAt: string;
  orderType: OrderType;
  selectedTableId: number | null;
  selectedTableLabel: string;
  guestCount: number | null;
  note: string;
  cart: CartLine[];
}

const HELD_CARTS_STORAGE_KEY = 'sippay_pos_held_carts';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, ReceiptComponent, PaymentPanelComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss'
})
export class PosComponent implements OnInit {
  categories = signal<Category[]>([]);
  menuItems = signal<MenuItem[]>([]);
  tables = signal<DiningTable[]>([]);
  zones = signal<Zone[]>([]);
  // รายการจอง/กันโต๊ะที่ยัง active อยู่ ใช้แค่แปะป้ายชื่อลูกค้าบนโต๊ะที่จองไว้ใน popup เลือกโต๊ะ
  reservations = signal<Reservation[]>([]);
  cart = signal<CartLine[]>([]);

  selectedCategoryId = signal<number | null>(null);
  submitting = signal(false);

  // ฟิลด์ธรรมดา ไม่ใช่ signal เพราะผูกกับ ngModel โดยตรง
  orderType: OrderType = 'dine_in';
  selectedTableId: number | null = null;
  // จำนวนคนที่มา (เฉพาะนั่งทาน) ไม่บังคับกรอก แค่เตือนถ้าเกินที่นั่งของโต๊ะ ไม่ได้บล็อกการสั่ง
  guestCount: number | null = null;
  // คำสั่งพิเศษ/โน้ตระดับทั้งบิล (ต่างจากโน้ตของแต่ละรายการ) กรอกได้ตั้งแต่ก่อนส่งออเดอร์
  orderNote = '';

  // ---- กล่องเลือกตัวเลือกเมนู (เช่น ความหวาน) เปิดจากการ์ดสินค้าโดยตรง ----
  // หมายเหตุ: ไม่มีช่องโน้ตในกล่องนี้แล้ว ถ้าอยากใส่โน้ตให้ไปใส่ที่ช่องโน้ตของแต่ละรายการใน "บิลปัจจุบัน"
  // ถ้า editingLineId มีค่า แปลว่ากำลังแก้ไขตัวเลือกของรายการที่เพิ่มไปแล้วในบิล (ไม่ใช่เพิ่มรายการใหม่)
  optionDialogItem = signal<MenuItem | null>(null);
  // แต่ละกลุ่มเก็บเป็น array ของ choice id ที่เลือกไว้ เพื่อรองรับทั้งกลุ่มเลือกได้อย่างเดียว (array 1 ตัว)
  // และกลุ่มเลือกได้หลายอย่าง (array หลายตัว ไม่เกิน max_select)
  optionDialogSelections: Record<number, number[]> = {};
  editingLineId = signal<number | null>(null);

  // ---- popup เลือกโต๊ะ (แบ่งตามโซน) + กรอกจำนวนคน ----
  tableModalOpen = signal(false);

  // ---- popup ตรวจสอบรายการก่อนส่งออเดอร์จริง ----
  reviewOpen = signal(false);

  // ---- popup โชว์เลขออเดอร์หลังส่งสำเร็จ (เฉพาะออเดอร์ซื้อกลับ) ----
  takeawayResult = signal<Order | null>(null);

  // ---- popup แก้ไขโน้ตของรายการในบิล (กดปุ่ม "โน้ต" ที่แต่ละรายการ) ----
  noteDialogLineId = signal<number | null>(null);
  noteDialogDraft = '';

  // ---- บิลที่พักไว้ (พักบิล / เรียกคืน) ----
  heldCarts = signal<HeldCart[]>([]);
  holdCount = computed(() => this.heldCarts().length);
  heldCartsModalOpen = signal(false);
  // มีค่าเมื่อกด "เรียกคืน" บิลที่พักไว้ ระหว่างที่บิลปัจจุบันยังมีรายการอยู่ — ต้องถามยืนยันก่อนแทนที่บิลปัจจุบัน
  pendingResumeHeldCart = signal<HeldCart | null>(null);

  // ข้อมูลร้านค้า ใช้ทั้งตอนสร้าง QR พร้อมเพย์ (ใบแจ้งหนี้ + จ่ายเงินทันที) และตอนพิมพ์ใบเสร็จ — โหลดครั้งเดียว
  // เก็บไว้ใช้ซ้ำ (lazy load ตอนเปิดใช้งานจริงครั้งแรก ไม่ต้องรอโหลดตั้งแต่เข้าหน้า)
  shopSettings = signal<ShopSettings | null>(null);

  // ---- popup "พิมพ์ใบแจ้งหนี้ (QR)" — แสดงยอดรวมของบิลปัจจุบันพร้อม QR พร้อมเพย์ให้ลูกค้าดู/สแกนจ่ายได้
  // ก่อนกดส่งออเดอร์จริง (เช่น ให้ลูกค้าซื้อกลับบ้านดูยอดแล้วตัดสินใจ หรือสแกนจ่ายไว้ล่วงหน้า) ไม่ผูกกับออเดอร์ใดๆ
  // ในระบบ เป็นแค่เอกสารสรุปยอดจากตะกร้าปัจจุบัน ยังไม่ได้บันทึกเป็นออเดอร์จริงจนกว่าจะกด "ส่งออเดอร์"
  invoiceQuoteOpen = signal(false);
  invoiceQrDataUrl = signal<string | null>(null);
  invoiceQrLoading = signal(false);
  // เวลาที่เปิดใบแจ้งหนี้ (ไว้พิมพ์ท้ายเอกสาร) — จับตอนเปิด ไม่ใช่ตอนพิมพ์ กันเวลาขยับถ้าเปิดค้างไว้นาน
  invoiceQuotePrintedAt = new Date();

  // ---- ชำระเงินทันทีจากหน้า POS (ซื้อกลับ หรือ นั่งทานที่อยากจ่ายล่วงหน้า) — สร้างออเดอร์แล้วเปิด popup
  // เก็บเงินต่อทันทีในหน้านี้เลย ไม่ต้องกดส่งออเดอร์แล้วไปเปิดหน้าคิดเงิน (checkout) แยกต่างหาก
  // ใช้ PaymentPanelComponent ตัวเดียวกับหน้าคิดเงินหลักและ popup "ชำระเงินก่อน" ที่หน้าคิวออเดอร์ ---
  payingOrder = signal<Order | null>(null); // ออเดอร์ที่สร้างแล้วรอเก็บเงิน (มีค่า = popup เปิดอยู่)

  // ผลลัพธ์หลังจ่ายเงินสำเร็จจากหน้านี้ (มีค่า = popup สรุป/พิมพ์ใบเสร็จเปิดอยู่)
  paidTakeawayOrder = signal<Order | null>(null);
  paidReceiptOpen = signal(false);
  downloadingPaidInvoice = signal(false);

  private nextLineId = 1;

  filteredMenuItems = computed(() => {
    const catId = this.selectedCategoryId();
    const items = this.menuItems();
    return catId ? items.filter((m) => m.category_id === catId) : items;
  });

  // ใช้แปะป้ายหมวดหมู่บนการ์ดสินค้า โดยไม่ต้องพึ่ง item.category ที่ backend preload มาให้บางทีเท่านั้น
  categoryNameById = computed(() => {
    const map = new Map<number, string>();
    for (const c of this.categories()) {
      map.set(c.id, c.name);
    }
    return map;
  });

  cartTotal = computed(() =>
    this.cart().reduce((sum, line) => sum + this.lineUnitPrice(line) * line.quantity, 0)
  );

  // จำนวนชิ้นรวมทั้งบิล ใช้โชว์หัวข้อ "N ชิ้นจาก M รายการ"
  cartQtyTotal = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));

  // จำนวนที่เพิ่มลงบิลไปแล้วของเมนูแต่ละอย่าง (รวมทุกบรรทัดของเมนูเดียวกัน แม้เลือกตัวเลือกย่อยต่างกัน) —
  // ใช้ใส่ border + ป้าย "×N" ที่การ์ดเมนูฝั่งซ้าย ให้เห็นชัดว่าเมนูไหนกดเพิ่มไปแล้วบ้าง ไม่ต้องมองหาในบิลขวา
  cartQtyByMenuItemId = computed(() => {
    const map = new Map<number, number>();
    for (const line of this.cart()) {
      map.set(line.menuItem.id, (map.get(line.menuItem.id) ?? 0) + line.quantity);
    }
    return map;
  });

  cartQtyForItem(itemId: number): number {
    return this.cartQtyByMenuItemId().get(itemId) ?? 0;
  }

  // ป้ายสถานะเล็กๆ มุมบนของกล่องบิล — ไม่ใช่ "พร้อมชำระ" เพราะหน้านี้แค่ส่งออเดอร์เข้าครัว ยังไม่ได้คิดเงินจริง
  cartStatusLabel = computed(() => (this.cart().length > 0 ? 'พร้อมส่งออเดอร์' : 'ยังไม่มีรายการ'));

  // โต๊ะที่เลือกได้ในหน้าขาย: ว่างปกติ หรือจองไว้ (reserved — ให้เลือกได้เพื่อเปิดบิลให้ลูกค้าที่จองไว้)
  // แต่ต้องไม่อยู่ในโซนที่ปิดใช้งาน (เช่น ปิดซ่อม หรือมีการจองที่นั่งไว้ทั้งโซน) และไม่มีคนนั่งอยู่แล้ว (occupied)
  availableTables = computed(() => {
    const inactiveZones = new Set(this.zones().filter((z) => !z.is_active).map((z) => z.name));
    return this.tables().filter(
      (t) => (t.status === 'available' || t.status === 'reserved') && !inactiveZones.has(t.zone)
    );
  });

  // แปะป้ายชื่อลูกค้าที่จองไว้บนโต๊ะที่ยังจองอยู่ (status reserved) ใน popup เลือกโต๊ะ
  reservationByTableId = computed(() => {
    const map = new Map<number, Reservation>();
    for (const r of this.reservations()) {
      map.set(r.table_id, r);
    }
    return map;
  });

  // จัดกลุ่มโต๊ะว่างตามโซน ให้ popup เลือกโต๊ะแสดงแยกเป็นส่วนๆ
  tablesByZone = computed(() => {
    const groups = new Map<string, DiningTable[]>();
    for (const t of this.availableTables()) {
      const zone = t.zone?.trim() || 'ไม่ระบุโซน';
      if (!groups.has(zone)) {
        groups.set(zone, []);
      }
      groups.get(zone)!.push(t);
    }
    return Array.from(groups.entries()).map(([zone, tables]) => ({ zone, tables }));
  });

  constructor(
    private menuService: MenuService,
    private tableService: TableService,
    private zoneService: ZoneService,
    private reservationService: ReservationService,
    private orderService: OrderService,
    private shopSettingsService: ShopSettingsService,
    private toastService: ToastService
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
    this.refreshReservations();
    this.zoneService.getZones().subscribe((zones) => this.zones.set(zones));
    this.loadHeldCarts();
  }

  refreshTables(): void {
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
  }

  refreshReservations(): void {
    this.reservationService.listReservations().subscribe((reservations) => this.reservations.set(reservations));
  }

  // id เป็น null เมื่อกดแท็บ "ทั้งหมด" — filteredMenuItems() คืนเมนูทุกหมวดรวมกันเมื่อไม่มี catId
  selectCategory(id: number | null): void {
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

  // ลบรายการนี้ออกจากบิลทั้งหมดในคลิกเดียว (ต่างจาก changeQuantity ที่ต้องกด "-" ไล่ทีละชิ้น)
  removeLine(lineId: number): void {
    this.cart.set(this.cart().filter((line) => line.lineId !== lineId));
  }

  clearCart(): void {
    this.cart.set([]);
  }

  // ---- popup แก้ไขโน้ตของแต่ละรายการในบิล (กดปุ่ม "โน้ต" ที่รายการนั้น) ----

  openLineNoteDialog(line: CartLine): void {
    this.noteDialogLineId.set(line.lineId);
    this.noteDialogDraft = line.note;
  }

  closeLineNoteDialog(): void {
    this.noteDialogLineId.set(null);
    this.noteDialogDraft = '';
  }

  saveLineNoteDialog(): void {
    const lineId = this.noteDialogLineId();
    if (lineId === null) return;
    this.cart.set(
      this.cart().map((line) => (line.lineId === lineId ? { ...line, note: this.noteDialogDraft.trim() } : line))
    );
    this.closeLineNoteDialog();
  }

  // ---- บิลที่พักไว้ (พักบิล / เรียกคืน) — เก็บที่ localStorage ของเครื่องนี้ เพราะยังไม่ใช่ออเดอร์จริงจนกว่าจะกด "ส่งออเดอร์" ----

  private loadHeldCarts(): void {
    try {
      const raw = localStorage.getItem(HELD_CARTS_STORAGE_KEY);
      this.heldCarts.set(raw ? (JSON.parse(raw) as HeldCart[]) : []);
    } catch {
      this.heldCarts.set([]);
    }
  }

  private persistHeldCarts(): void {
    localStorage.setItem(HELD_CARTS_STORAGE_KEY, JSON.stringify(this.heldCarts()));
  }

  holdCurrentCart(): void {
    if (this.cart().length === 0) {
      this.toastService.info('ยังไม่มีรายการในบิลปัจจุบันให้พัก');
      return;
    }

    const held: HeldCart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      heldAt: new Date().toISOString(),
      orderType: this.orderType,
      selectedTableId: this.selectedTableId,
      selectedTableLabel: this.orderType === 'dine_in' && this.selectedTableId ? this.selectedTableLabel() : '',
      guestCount: this.guestCount,
      note: this.orderNote,
      cart: this.cart()
    };

    this.heldCarts.set([held, ...this.heldCarts()]);
    this.persistHeldCarts();

    // เคลียร์บิลปัจจุบันให้เริ่มรับรายการใหม่ได้ทันที
    this.cart.set([]);
    this.orderType = 'dine_in';
    this.selectedTableId = null;
    this.guestCount = null;
    this.orderNote = '';

    this.toastService.success('พักบิลแล้ว กดปุ่ม ▶ เพื่อเรียกคืนทีหลังได้');
  }

  heldCartLabel(held: HeldCart): string {
    const target = held.orderType === 'dine_in' ? (held.selectedTableLabel || 'นั่งทาน (ยังไม่เลือกโต๊ะ)') : 'ซื้อกลับ';
    const time = new Date(held.heldAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${target} · ${time}`;
  }

  heldCartQtyTotal(held: HeldCart): number {
    return held.cart.reduce((sum, line) => sum + line.quantity, 0);
  }

  heldCartTotal(held: HeldCart): number {
    return held.cart.reduce((sum, line) => sum + this.lineUnitPrice(line) * line.quantity, 0);
  }

  openHeldCartsModal(): void {
    this.heldCartsModalOpen.set(true);
  }

  closeHeldCartsModal(): void {
    this.heldCartsModalOpen.set(false);
    this.pendingResumeHeldCart.set(null);
  }

  // ถ้าบิลปัจจุบันมีรายการอยู่แล้ว ต้องถามยืนยันก่อน เพราะเรียกคืนแล้วจะแทนที่บิลปัจจุบันทั้งหมด
  requestResumeHeldCart(held: HeldCart): void {
    if (this.cart().length > 0) {
      this.pendingResumeHeldCart.set(held);
      return;
    }
    this.resumeHeldCart(held);
  }

  cancelResumeOverwrite(): void {
    this.pendingResumeHeldCart.set(null);
  }

  confirmResumeOverwrite(): void {
    const held = this.pendingResumeHeldCart();
    if (held) this.resumeHeldCart(held);
    this.pendingResumeHeldCart.set(null);
  }

  private resumeHeldCart(held: HeldCart): void {
    this.orderType = held.orderType;
    this.selectedTableId = held.selectedTableId;
    this.guestCount = held.guestCount;
    this.orderNote = held.note;
    this.cart.set(held.cart);

    this.heldCarts.set(this.heldCarts().filter((h) => h.id !== held.id));
    this.persistHeldCarts();
    this.heldCartsModalOpen.set(false);
    this.toastService.success('เรียกคืนบิลที่พักไว้แล้ว');
  }

  deleteHeldCart(held: HeldCart): void {
    if (!confirm(`ลบบิลที่พักไว้ "${this.heldCartLabel(held)}"? การลบไม่สามารถย้อนกลับได้`)) return;
    this.heldCarts.set(this.heldCarts().filter((h) => h.id !== held.id));
    this.persistHeldCarts();
  }

  // ---- ปุ่มที่ยกมาจากดีไซน์ต้นแบบ (DotPOS) แต่ยังไม่มีฟีเจอร์รองรับจริงในระบบนี้ ----
  // กดแล้วบอกสถานะตรงๆ แทนที่จะทำเป็นปุ่มใช้งานได้จริงทั้งที่ยังไม่มีอะไรอยู่เบื้องหลัง
  showMemberInfo(): void {
    this.toastService.info('ฟีเจอร์เพิ่มสมาชิกยังไม่เปิดใช้งานในระบบนี้');
  }

  showDiscountInfo(): void {
    this.toastService.info('ใส่ส่วนลดได้หลังส่งออเดอร์แล้ว ที่หน้าคิดเงิน (checkout)');
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
      const enabledChoices = group.choices.filter((c) => c.is_enabled !== false);
      if (enabledChoices.length === 0) continue;
      const defaults = enabledChoices.filter((c) => c.is_default);
      if (defaults.length > 0) {
        this.optionDialogSelections[group.id] = defaults.map((c) => c.id);
      } else if (group.selection_type !== 'multi' && group.is_required) {
        // บังคับเลือกและไม่มีตัวเลือกไหนตั้งเป็นค่าเริ่มต้นไว้ — เลือกตัวแรกให้อัตโนมัติ (ต้องเลือกอยู่แล้ว)
        // ถ้าไม่บังคับเลือก (เช่น "ไข่" เลือกได้อย่างเดียวแต่ไม่บังคับ) ต้องปล่อยว่างไว้ ไม่สุ่มเลือกให้
        this.optionDialogSelections[group.id] = [enabledChoices[0].id];
      } else {
        this.optionDialogSelections[group.id] = [];
      }
    }
  }

  closeOptionsDialog(): void {
    this.optionDialogItem.set(null);
    this.editingLineId.set(null);
  }

  isChoiceSelected(groupId: number, choiceId: number): boolean {
    return (this.optionDialogSelections[groupId] ?? []).includes(choiceId);
  }

  // group เลือกได้อย่างเดียว (single) = แทนที่ค่าเดิม, เลือกได้หลายอย่าง (multi) = toggle เพิ่ม/เอาออก (จำกัดด้วย max_select)
  selectOption(group: MenuOptionGroup, choiceId: number): void {
    const current = this.optionDialogSelections[group.id] ?? [];
    if (group.selection_type !== 'multi') {
      this.optionDialogSelections[group.id] = [choiceId];
      return;
    }
    if (current.includes(choiceId)) {
      this.optionDialogSelections[group.id] = current.filter((id) => id !== choiceId);
    } else {
      const max = group.max_select && group.max_select > 0 ? group.max_select : group.choices.length;
      if (current.length >= max) return;
      this.optionDialogSelections[group.id] = [...current, choiceId];
    }
  }

  // เปิดกล่องตัวเลือกอีกครั้งเพื่อแก้ไขรายการที่เพิ่มไปแล้วในบิล (ไม่ใช่เพิ่มรายการใหม่)
  editLine(line: CartLine): void {
    if (!line.menuItem.option_groups || line.menuItem.option_groups.length === 0) return;

    this.optionDialogItem.set(line.menuItem);
    this.optionDialogSelections = {};
    for (const opt of line.selectedOptions) {
      const current = this.optionDialogSelections[opt.groupId] ?? [];
      this.optionDialogSelections[opt.groupId] = [...current, opt.choiceId];
    }
    this.editingLineId.set(line.lineId);
  }

  confirmOptions(): void {
    const item = this.optionDialogItem();
    if (!item) return;

    const missingRequired = (item.option_groups ?? []).some(
      (g) => g.is_required && (this.optionDialogSelections[g.id]?.length ?? 0) === 0
    );
    if (missingRequired) {
      this.toastService.error('กรุณาเลือกตัวเลือกที่บังคับให้ครบก่อนเพิ่มลงบิล');
      return;
    }

    const belowMin = (item.option_groups ?? []).some(
      (g) => g.min_select > 0 && (this.optionDialogSelections[g.id]?.length ?? 0) < g.min_select
    );
    if (belowMin) {
      this.toastService.error('กรุณาเลือกตัวเลือกให้ครบตามจำนวนขั้นต่ำของแต่ละกลุ่มก่อนเพิ่มลงบิล');
      return;
    }

    const selectedOptions: SelectedOption[] = (item.option_groups ?? []).flatMap((g) => {
      const choiceIds = this.optionDialogSelections[g.id] ?? [];
      return choiceIds
        .map((choiceId) => g.choices.find((c) => c.id === choiceId))
        .filter((choice): choice is NonNullable<typeof choice> => !!choice)
        .map((choice) => ({
          groupId: g.id,
          groupName: g.name,
          choiceId: choice.id,
          choiceName: choice.name,
          priceDelta: choice.price_delta
        }));
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

    this.closeOptionsDialog();
  }

  // เดิม submitOrder() ยิง API ทันที ตอนนี้แยกเป็น 2 ขั้น: เปิด popup ให้ตรวจรายการก่อน (openReview)
  // แล้วค่อยยืนยันจริงจาก popup (confirmSubmitOrder) เพื่อกันสั่งผิด/ลืมเช็ครายการ
  openReview(): void {
    const lines = this.cart();
    if (lines.length === 0) {
      this.toastService.error('กรุณาเลือกรายการอาหารก่อน');
      return;
    }
    if (this.orderType === 'dine_in' && !this.selectedTableId) {
      this.toastService.error('กรุณาเลือกโต๊ะสำหรับออเดอร์นั่งทาน');
      return;
    }
    this.reviewOpen.set(true);
  }

  closeReview(): void {
    this.reviewOpen.set(false);
  }

  // ---- popup เลือกโต๊ะ ----

  openTableModal(): void {
    this.tableModalOpen.set(true);
  }

  closeTableModal(): void {
    this.tableModalOpen.set(false);
  }

  chooseTable(tableId: number): void {
    this.selectedTableId = tableId;
  }

  // ตัวเลือกจำนวนคนแบบกดเร็ว ไล่ 1..ความจุของโต๊ะที่เลือกไว้ (ถ้าโต๊ะไม่ได้ตั้งความจุไว้ จะไม่มีตัวเลือกให้กด
  // ต้องพิมพ์ในช่องจำนวนคนแทน)
  guestCountOptions(): number[] {
    const table = this.tables().find((t) => t.id === this.selectedTableId);
    if (!table || !table.capacity) return [];
    return Array.from({ length: table.capacity }, (_, i) => i + 1);
  }

  chooseGuestCount(n: number): void {
    this.guestCount = n;
  }

  selectedTableLabel(): string {
    const table = this.tables().find((t) => t.id === this.selectedTableId);
    return table ? `${table.name} (${table.zone})` : '-';
  }

  // ป้ายชื่อลูกค้าที่จองโต๊ะนี้ไว้ (ถ้าโต๊ะอยู่ในสถานะจองไว้) ให้พนักงานเห็นตอนเลือกโต๊ะใน popup
  reservationTagFor(tableId: number): string | null {
    const r = this.reservationByTableId().get(tableId);
    if (!r) return null;
    return r.reserved_for
      ? `จองไว้: ${r.customer_name} (${new Date(r.reserved_for).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })})`
      : `กันไว้: ${r.customer_name}`;
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

    const orderType = this.orderType;

    this.orderService
      .createOrder({
        order_type: orderType,
        table_id: orderType === 'dine_in' ? this.selectedTableId! : undefined,
        guest_count: orderType === 'dine_in' && this.guestCount ? this.guestCount : undefined,
        note: this.orderNote.trim() || undefined,
        items
      })
      .subscribe({
        next: (createdOrder) => {
          this.submitting.set(false);
          this.reviewOpen.set(false);
          this.clearCart();
          this.selectedTableId = null;
          this.guestCount = null;
          this.orderNote = '';
          this.refreshTables();
          this.refreshReservations();

          if (orderType === 'takeaway') {
            // ออเดอร์ซื้อกลับ ต้องมีเลขให้บอกลูกค้าไว้รอรับของ เลยขึ้น popup ใหญ่แทนข้อความเล็กๆ
            this.takeawayResult.set(createdOrder);
          } else {
            this.toastService.success('ส่งออเดอร์เรียบร้อย');
          }
        },
        error: (err) => {
          this.submitting.set(false);
          this.toastService.error(err?.error?.error ?? 'ส่งออเดอร์ไม่สำเร็จ');
        }
      });
  }

  closeTakeawayResult(): void {
    this.takeawayResult.set(null);
  }

  // โหลดข้อมูลร้านค้าใหม่ทุกครั้ง (ไม่ cache) แล้วค่อยรัน callback ต่อ — ใช้ทั้งตอนสร้าง QR ใบแจ้งหนี้และ QR
  // ตอนจ่ายเงินทันที เดิม cache ไว้ตั้งแต่ครั้งแรกที่เปิดหน้านี้ ทำให้ถ้าแอดมินเพิ่ง "ตั้งค่าเลขพร้อมเพย์" หลัง
  // เปิดหน้าขายค้างไว้แล้ว (โดยไม่รีเฟรชหน้า) QR จะไม่ขึ้นเพราะยังถือค่าเก่า (promptpay_id ว่าง) อยู่ — ตอนนี้
  // ดึงใหม่ทุกครั้งที่เปิด popup แทน ถ้าโหลดไม่สำเร็จก็ยังรัน callback ต่อได้ (แค่จะไม่มี QR ให้แสดง)
  private ensureShopSettingsLoaded(onReady: () => void): void {
    this.shopSettingsService.getShopSettings().subscribe({
      next: (s) => {
        this.shopSettings.set(s);
        onReady();
      },
      error: () => onReady()
    });
  }

  // ---- popup "พิมพ์ใบแจ้งหนี้ (QR)" ----

  openInvoiceQuote(): void {
    if (this.cart().length === 0) {
      this.toastService.error('กรุณาเลือกรายการอาหารก่อน');
      return;
    }
    this.invoiceQuotePrintedAt = new Date();
    this.invoiceQuoteOpen.set(true);
    this.ensureShopSettingsLoaded(() => this.buildInvoiceQr());
  }

  closeInvoiceQuote(): void {
    this.invoiceQuoteOpen.set(false);
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

  private buildInvoiceQr(): void {
    const shop = this.shopSettings();
    const total = this.cartTotal();
    if (!shop?.promptpay_id || total <= 0) {
      this.invoiceQrDataUrl.set(null);
      return;
    }
    this.invoiceQrLoading.set(true);
    const payload = generatePromptPayPayload(shop.promptpay_id, total);
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

  // ---- ชำระเงินทันที (ใช้ได้ทั้งนั่งทานและซื้อกลับ) ----

  // สร้างออเดอร์แล้วเปิด popup เก็บเงินต่อทันที ไม่ต้องกดส่งออเดอร์แล้วไปเปิดหน้าคิดเงินแยกต่างหาก
  // เดิมรองรับแค่ซื้อกลับ (สั่งง่าย ไม่ต้องเลือกโต๊ะ) ตอนนี้ปุ่มนี้แสดงตลอด เลยต้องรองรับนั่งทานด้วย —
  // ใช้เงื่อนไข/payload เดียวกับ confirmSubmitOrder() (ต้องเลือกโต๊ะก่อนถ้าเป็นนั่งทาน)
  payNow(): void {
    const lines = this.cart();
    if (lines.length === 0) {
      this.toastService.error('กรุณาเลือกรายการอาหารก่อน');
      return;
    }
    if (this.orderType === 'dine_in' && !this.selectedTableId) {
      this.toastService.error('กรุณาเลือกโต๊ะสำหรับออเดอร์นั่งทาน');
      return;
    }

    const items: CreateOrderItemInput[] = lines.map((line) => ({
      menu_item_id: line.menuItem.id,
      quantity: line.quantity,
      note: line.note,
      option_choice_ids: line.selectedOptions.map((o) => o.choiceId),
      is_takeaway: line.isTakeaway
    }));

    this.submitting.set(true);
    const orderType = this.orderType;
    this.orderService
      .createOrder({
        order_type: orderType,
        table_id: orderType === 'dine_in' ? this.selectedTableId! : undefined,
        guest_count: orderType === 'dine_in' && this.guestCount ? this.guestCount : undefined,
        note: this.orderNote.trim() || undefined,
        items
      })
      .subscribe({
        next: (createdOrder) => {
          this.submitting.set(false);
          this.clearCart();
          this.selectedTableId = null;
          this.guestCount = null;
          this.orderNote = '';
          this.refreshTables();
          this.refreshReservations();
          this.openPaymentModal(createdOrder);
        },
        error: (err) => {
          this.submitting.set(false);
          this.toastService.error(err?.error?.error ?? 'สร้างออเดอร์ไม่สำเร็จ');
        }
      });
  }

  private openPaymentModal(order: Order): void {
    this.payingOrder.set(order);
    // โหลดข้อมูลร้านค้าล่วงหน้าไว้เลย (ไม่ต้องรอจนกว่าจะกดเลือก "โอนเงิน") เพื่อให้กด "พิมพ์บิล" ได้ทันที
    // ตั้งแต่เปิด popup ครั้งแรก เห็นหัวบิลชื่อร้านครบ ไม่ต้องรอโหลดตอนกำลังจะพิมพ์
    this.ensureShopSettingsLoaded(() => {});
  }

  closePaymentModal(): void {
    this.payingOrder.set(null);
  }

  // พิมพ์บิล (ชื่อร้าน/รายการ/ยอดรวม + QR ถ้าเลือกโอนเงิน) ให้ลูกค้าดู/สแกนจ่ายจากกระดาษได้ ก่อนที่พนักงาน
  // จะกด "ยืนยันรับเงิน" — ไม่ได้ปิดบิลหรือบันทึกการชำระเงินใดๆ แค่พิมพ์เอกสารเฉยๆ ต้องรอพนักงานตรวจสอบว่า
  // ลูกค้าจ่ายจริงแล้วค่อยกดยืนยันรับเงินแยกต่างหากเสมอ
  printPaymentBill(): void {
    window.print();
  }

  // เรียกจาก <app-payment-panel> ตอนปิดบิลสำเร็จ
  onPaid(paid: Order): void {
    this.payingOrder.set(null);
    this.refreshTables();
    this.refreshReservations();
    this.paidTakeawayOrder.set(paid);
  }

  // ---- popup สรุปผลหลังจ่ายเงินสำเร็จ (พิมพ์ใบเสร็จ / ดาวน์โหลด PDF) ----

  closePaidTakeawayResult(): void {
    this.paidTakeawayOrder.set(null);
    this.paidReceiptOpen.set(false);
  }

  openPaidReceipt(): void {
    this.ensureShopSettingsLoaded(() => {
      this.paidReceiptOpen.set(true);
    });
  }

  closePaidReceipt(): void {
    this.paidReceiptOpen.set(false);
  }

  downloadPaidInvoicePdf(): void {
    const order = this.paidTakeawayOrder();
    if (!order) return;
    this.downloadingPaidInvoice.set(true);
    this.orderService.downloadInvoicePdf(order.id).subscribe({
      next: (blob) => {
        this.downloadingPaidInvoice.set(false);
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        this.downloadingPaidInvoice.set(false);
        this.toastService.error('ดาวน์โหลดใบเสร็จ PDF ไม่สำเร็จ');
      }
    });
  }
}
