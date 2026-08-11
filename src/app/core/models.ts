export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 'open' | 'preparing' | 'served' | 'paid' | 'cancelled';
export type OrderItemStatus = 'pending' | 'preparing' | 'served';
export type DiscountType = 'none' | 'amount' | 'percent';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'staff';
  // ปิดใช้งานบัญชีได้แทนการลบทิ้ง (เช่น พนักงานลาออก) เพื่อให้ order/payment เก่ายังเช็คย้อนหลังได้ว่าใครทำ
  is_active: boolean;
  // ตั้ง PIN ไว้แล้วหรือยัง (ไม่ใช่ PIN ดิบ — แค่สถานะ) ใช้โชว์ที่หน้า "จัดการพนักงาน" ว่าคนนี้ล็อกอินด้วย PIN
  // ได้หรือยัง — undefined ได้ในบาง response เก่า ให้ถือว่ายังไม่ได้ตั้ง
  has_pin?: boolean;
  // เวลาที่ตั้ง/แก้ไข PIN ล่าสุด (null ถ้ายังไม่เคยตั้งหรือถูกลบ PIN ทิ้งไปแล้ว) โชว์ที่หน้าแก้ไขพนักงาน
  pin_updated_at?: string | null;
}

// ข้อมูลย่อของพนักงานที่ใช้แสดงในหน้า "เลือกพนักงาน" ก่อนกด PIN (ไม่มี username/ข้อมูลอ่อนไหวอื่น)
export interface PinLoginUser {
  id: number;
  name: string;
  role: 'admin' | 'staff';
}

export interface Category {
  id: number;
  name: string;
  description: string;
  // สีของหมวดหมู่ เก็บเป็น hex เช่น "#4f46e5" ใช้แสดงจุดสีหน้ารายการหมวดหมู่
  color: string;
  sort_order: number;
  // เปิด/ปิดใช้งานหมวดหมู่นี้ในหน้าขาย (POS) โดยไม่ลบทิ้ง
  is_enabled: boolean;
  is_archived: boolean;
  // สถานที่ทำ เช่น ครัว/บาร์/อื่นๆ — คอลัมน์เก่ายังอยู่ที่ backend (หน้าจอครัวยังอ่านค่านี้)
  // แต่หน้าจัดการเมนูรุ่นใหม่ไม่มีช่องแก้ไขแล้ว
  station: string;
}

export type OptionSelectionType = 'single' | 'multi';

export interface CategoryOptionTemplateChoice {
  id: number;
  template_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
}

// เทมเพลตกลุ่มตัวเลือกระดับหมวดหมู่ ("ตัวเลือกเสริม") ใช้เป็นแม่แบบให้เลือกใช้ซ้ำได้เร็วตอนสร้าง/แก้ไขเมนู
// ไม่ผูกกับหมวดหมู่ใดหมวดหมู่หนึ่งตายตัวในหน้า UI (แสดงรวมทุกหมวดหมู่) แต่ backend ยังเก็บ category_id ไว้อยู่
export interface CategoryOptionTemplate {
  id: number;
  category_id: number;
  name: string;
  description: string;
  selection_type: OptionSelectionType;
  min_select: number;
  max_select: number;
  is_required: boolean;
  is_enabled: boolean;
  is_archived: boolean;
  sort_order: number;
  choices: CategoryOptionTemplateChoice[];
}

export interface MenuOptionChoice {
  id: number;
  option_group_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
  // ถูกเลือกไว้ล่วงหน้าให้อัตโนมัติตอนเปิดกล่องเลือก (แค่ค่าเริ่มต้น ลูกค้าเปลี่ยนได้)
  is_default: boolean;
  // ปิดใช้งานตัวเลือกย่อยนี้ชั่วคราวได้โดยไม่ต้องลบทิ้ง
  is_enabled: boolean;
}

export interface MenuOptionGroup {
  id: number;
  menu_item_id: number;
  name: string;
  description: string;
  // single = เลือกได้อย่างเดียว, multi = เลือกได้หลายอย่าง
  selection_type: OptionSelectionType;
  min_select: number;
  max_select: number;
  is_required: boolean;
  is_enabled: boolean;
  sort_order: number;
  choices: MenuOptionChoice[];
}

export interface MenuItem {
  id: number;
  category_id: number;
  // แนบมาเฉพาะตอนที่ backend preload ให้ (เช่น รายการในออเดอร์ที่จอครัวใช้จัดกลุ่มตาม station)
  category?: Category;
  name: string;
  price: number;
  is_available: boolean;
  // path รูปเมนูที่อัปโหลดไว้ เช่น "/uploads/menu-items/xxx.jpg" ว่างได้ถ้ายังไม่มีรูป
  image_path: string;
  is_featured: boolean;
  is_bestseller: boolean;
  track_stock: boolean;
  is_archived: boolean;
  option_groups?: MenuOptionGroup[];
}

export interface DiningTable {
  id: number;
  name: string;
  zone: string;
  status: 'available' | 'occupied' | 'reserved';
  // จำนวนคนที่นั่งได้ ใช้เตือน (ไม่บังคับ) ตอนสร้างออเดอร์ถ้าจำนวนคนเกินที่นั่ง
  capacity: number;
}

export type ReservationStatus = 'active' | 'seated' | 'cancelled' | 'no_show';

// Reservation คือการกันโต๊ะไว้ให้ลูกค้า reserved_for เป็น null หมายถึงกันไว้ตอนนี้เลย (ลูกค้ามาถึงร้านแล้ว)
// ถ้ามีค่า หมายถึงลูกค้าโทร/จองโต๊ะไว้ล่วงหน้าสำหรับเวลานั้น
export interface Reservation {
  id: number;
  table_id: number;
  table?: DiningTable;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  reserved_for: string | null;
  note: string;
  status: ReservationStatus;
  order_id: number | null;
  created_by_user?: User;
  created_at: string;
}

// Zone คือโซนของโต๊ะ แยกจัดการเปิด/ปิดใช้งานได้ต่างหาก (เช่น ปิดซ่อม หรือมีการจองที่นั่งไว้ทั้งโซน)
export interface Zone {
  id: number;
  name: string;
  is_active: boolean;
}

// ShopSettings คือข้อมูลร้านค้า (แถวเดียว) โชว์บนหัวใบเสร็จตอนพิมพ์บิล แก้ไขได้ที่หน้า "ตั้งค่าร้านค้า" (admin)
export interface ShopSettings {
  id: number;
  name: string;
  address: string;
  phone: string;
  tax_id: string;
  // เลขพร้อมเพย์ของร้าน (เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก) ใช้สร้าง QR รับเงินที่
  // หน้าคิดเงินตอนเลือกวิธีชำระแบบโอนเงิน (ดู promptpay.ts) ว่างได้ถ้ายังไม่ได้ตั้งค่า
  promptpay_id: string;
  // ชื่อผู้รับเงินที่จะฝังใน QR ถ้าว่างจะ fallback ไปใช้ name (ชื่อร้าน) แทน
  promptpay_name: string;
}

export interface OrderItemOption {
  id: number;
  order_item_id: number;
  option_group_id: number;
  group_name: string;
  choice_id: number;
  choice_name: string;
  price_delta: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  menu_item?: MenuItem;
  quantity: number;
  unit_price: number;
  note: string;
  status: OrderItemStatus;
  is_takeaway: boolean;
  options?: OrderItemOption[];
}

export type PaymentMethod = 'cash' | 'transfer';

export interface Payment {
  id: number;
  order_id: number;
  method: PaymentMethod;
  subtotal: number;
  discount_amount: number;
  amount: number;
  received_amount: number;
  change_amount: number;
  // ใช้เฉพาะ method=transfer เลขอ้างอิงการโอน + path รูปสลิปที่แนบไว้ (แนบตอนปิดบิลหรือย้อนหลังก็ได้)
  transfer_ref: string;
  slip_image_path: string;
  // แนบมาเฉพาะตอนที่ backend preload ให้ — ใครเป็นคนกดปิดบิล/รับเงิน
  paid_by_user?: User;
  paid_at: string;
  // เลขที่ใบเสร็จ/ใบกำกับภาษีอย่างย่อ รูปแบบ INV-YYYYMMDD-00001 ออกอัตโนมัติตอนปิดบิล (รันต่อวัน)
  // ใช้เป็นชื่อไฟล์ตอนดาวน์โหลด PDF ใบเสร็จ (ดู OrderService.downloadInvoicePdf)
  invoice_no: string;
}

export interface Order {
  id: number;
  order_type: OrderType;
  table_id: number | null;
  table?: DiningTable;
  // จำนวนคนที่มา (ถ้าระบุ) ตั้งตอนสร้างที่ POS ได้ หรือมาแก้ทีหลังที่หน้าออเดอร์
  guest_count: number;
  // คำสั่งพิเศษ/โน้ตระดับทั้งบิล กรอกได้ตั้งแต่หน้าขายก่อนส่งออเดอร์ (ต่างจาก OrderItem.note ที่เป็นโน้ตต่อรายการ)
  note: string;
  // แนบมาเฉพาะตอนที่ backend preload ให้ — ใครเป็นคนเปิดบิลนี้
  created_by_user?: User;
  status: OrderStatus;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  payment?: Payment;
}

export interface TopSellingItem {
  name: string;
  quantity: number;
  total: number;
}

export interface ReportOrderSummary {
  order_id: number;
  order_type: OrderType;
  table_name: string;
  total_amount: number;
  created_by_name: string;
  paid_by_name: string;
  paid_at: string;
  payment_method: PaymentMethod;
  transfer_ref: string;
  slip_image_path: string;
}

export interface DailyReport {
  date: string;
  order_count: number;
  total_sales: number;
  top_items: TopSellingItem[];
  orders: ReportOrderSummary[];
}

// ยอดขายรวมของวันหนึ่งวัน ใช้ทำกราฟแนวโน้ม (แท็บ "แนวโน้ม" ที่หน้ารายงาน)
export interface DailySalesPoint {
  date: string;
  total_sales: number;
  order_count: number;
}

export interface SalesRangeReport {
  from: string;
  to: string;
  days: DailySalesPoint[];
}

// ===== Loyalty / Member =====

export type MemberTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Member {
  id: number;
  name: string;
  phone: string;
  points_balance: number;
  tier: MemberTier;
  total_spent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberPointHistory {
  id: number;
  member_id: number;
  order_id: number | null;
  change: number;
  reason: string;
  created_at: string;
}

export interface PointAccumulationRule {
  spend_per_point: number;
  points_expiry_days: number;
  min_spend_to_earn: number;
}

export interface RedemptionRule {
  points_per_baht: number;
  min_points_to_redeem: number;
  max_discount_ratio: number;
}

export interface TierRule {
  tier: MemberTier;
  label: string;
  min_total_spent: number;
  points_multiplier: number;
}

export interface LoyaltySettings {
  id: number;
  is_enabled: boolean;
  accumulation: PointAccumulationRule;
  redemption: RedemptionRule;
  tier_rules: TierRule[];
  updated_at: string;
}
