import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrderItem, ShopSettings, Order } from '../../core/models';

// ใบเสร็จสำหรับพิมพ์ (ออกแบบไว้ก่อนต่อเครื่องพิมพ์จริง) กว้าง 80mm ตามกระดาษ thermal printer มาตรฐาน
// ใช้ปุ่ม "พิมพ์ใบเสร็จ" -> window.print() (เบราว์เซอร์เลือกเครื่องพิมพ์เองได้) ธาตุ .receipt-print-root
// ถูกซ่อน/แสดงด้วย @media print ที่ src/styles.scss (global) ให้เห็นเฉพาะใบเสร็จตอนสั่งพิมพ์จริง
// ไม่ใช่ทั้งหน้าเว็บ — ใช้ซ้ำได้ทั้งจากหน้าคิดเงิน (พิมพ์ทันทีหลังปิดบิล) และหน้ารายงาน (พิมพ์ซ้ำย้อนหลัง)
//
// หมายเหตุ: ตอนต่อเครื่องพิมพ์ใบเสร็จจริง (ESC/POS) ในอนาคต ให้ใช้ข้อมูลชุดเดียวกันนี้ (order + shop)
// แปลงเป็นคำสั่ง ESC/POS แทนการ window.print() แบบนี้ (ดู ARCHITECTURE.md หัวข้อฮาร์ดแวร์)
@Component({
  selector: 'app-receipt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './receipt.component.html',
  styleUrl: './receipt.component.scss'
})
export class ReceiptComponent {
  order = input.required<Order>();
  shop = input<ShopSettings | null>(null);
  // true = แสดงแบบฝังอยู่ในหน้า (เช่น แผงรายละเอียดออเดอร์) ไม่ใช่ popup เต็มจอ — ไม่มี backdrop/ปุ่มปิด/ปุ่มพิมพ์ในตัว
  // (หน้าที่เรียกใช้ทำปุ่มพิมพ์เอง แล้วเรียก window.print() ตรงๆ ได้เลย เพราะ .receipt-print-root ถูกจับด้วย global CSS อยู่แล้ว)
  inline = input(false);

  close = output<void>();

  print(): void {
    window.print();
  }

  itemOptionsLabel(item: OrderItem): string {
    return (item.options ?? []).map((o) => o.choice_name).join(', ');
  }

  // เลขออเดอร์แบบอ่านง่าย เช่น ORD-20260806-00004 (วันที่เปิดบิล + running id ทับ 5 หลัก)
  orderCode(o: Order): string {
    const d = new Date(o.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `ORD-${y}${m}${day}-${String(o.id).padStart(5, '0')}`;
  }

  // จำนวนชิ้นรวมทั้งบิล (ผลรวม quantity ของทุกบรรทัด) — แสดงเป็นแถว "จำนวนรายการ" บนใบเสร็จ
  itemsCount(o: Order): number {
    return o.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  private static readonly THAI_MONTHS_SHORT = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.'
  ];

  // วันที่แบบไทยย่อ เช่น "6 ส.ค. 69 09:39" (ปี พ.ศ. 2 หลัก = (ค.ศ. + 543) % 100) — ใช้แสดงในแถว
  // "วันที่" บนใบเสร็จ (ดีไซน์ 4c: ตัวเลขทุกคอลัมน์เป็น mono ไม่กินที่มาก จึงย่อปีเหลือ 2 หลัก)
  formatThaiDate(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = ReceiptComponent.THAI_MONTHS_SHORT[d.getMonth()];
    const buddhistYear = (d.getFullYear() + 543) % 100;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${String(buddhistYear).padStart(2, '0')} ${hh}:${mm}`;
  }

  // รวม "โต๊ะ / คน" เป็นแถวเดียวตามดีไซน์ 4c เช่น "A3 / 4" หรือ "ซื้อกลับ" ถ้าเป็นออเดอร์กลับบ้าน
  tableGuestLabel(o: Order): string {
    if (o.order_type !== 'dine_in') return 'ซื้อกลับ';
    const table = o.table ? o.table.name : '-';
    return o.guest_count ? `${table} / ${o.guest_count}` : table;
  }
}
