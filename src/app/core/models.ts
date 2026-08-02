export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 'open' | 'preparing' | 'served' | 'paid' | 'cancelled';
export type OrderItemStatus = 'pending' | 'preparing' | 'served';
export type DiscountType = 'none' | 'amount' | 'percent';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'staff';
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  // สถานที่ทำ เช่น ครัว/บาร์/อื่นๆ เก็บไว้เผื่ออนาคตแยกจอทำงานตามสถานี ยังไม่มีหน้าไหนกรองจริง
  station: string;
}

export interface CategoryOptionTemplateChoice {
  id: number;
  template_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
}

export interface CategoryOptionTemplate {
  id: number;
  category_id: number;
  name: string;
  is_required: boolean;
  sort_order: number;
  choices: CategoryOptionTemplateChoice[];
}

export interface MenuOptionChoice {
  id: number;
  option_group_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
}

export interface MenuOptionGroup {
  id: number;
  menu_item_id: number;
  name: string;
  is_required: boolean;
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
  option_groups?: MenuOptionGroup[];
}

export interface DiningTable {
  id: number;
  name: string;
  zone: string;
  status: 'available' | 'occupied';
  // จำนวนคนที่นั่งได้ ใช้เตือน (ไม่บังคับ) ตอนสร้างออเดอร์ถ้าจำนวนคนเกินที่นั่ง
  capacity: number;
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

export interface Payment {
  id: number;
  order_id: number;
  method: string;
  subtotal: number;
  discount_amount: number;
  amount: number;
  received_amount: number;
  change_amount: number;
  paid_at: string;
}

export interface Order {
  id: number;
  order_type: OrderType;
  table_id: number | null;
  table?: DiningTable;
  // จำนวนคนที่มา (ถ้าระบุ) ตั้งตอนสร้างที่ POS ได้ หรือมาแก้ทีหลังที่หน้าออเดอร์
  guest_count: number;
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

export interface DailyReport {
  date: string;
  order_count: number;
  total_sales: number;
  top_items: TopSellingItem[];
}
