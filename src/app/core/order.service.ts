import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { DiscountType, Order, OrderType, Payment, PaymentMethod } from './models';
import { API_BASE_URL } from './api-config';

export interface CreateOrderItemInput {
  menu_item_id: number;
  quantity: number;
  note?: string;
  option_choice_ids?: number[];
  is_takeaway?: boolean;
}

export interface CreateOrderInput {
  order_type: OrderType;
  table_id?: number;
  guest_count?: number;
  note?: string;
  items: CreateOrderItemInput[];
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private http: HttpClient) {}

  createOrder(data: CreateOrderInput): Observable<Order> {
    return this.http.post<Order>(`${API_BASE_URL}/orders`, data);
  }

  listOrders(status?: string): Observable<Order[]> {
    let url = `${API_BASE_URL}/orders`;
    if (status) {
      url += `?status=${status}`;
    }
    return this.http.get<Order[]>(url);
  }

  getOrder(id: number): Observable<Order> {
    return this.http.get<Order>(`${API_BASE_URL}/orders/${id}`);
  }

  addItem(orderId: number, item: CreateOrderItemInput): Observable<Order> {
    return this.http.post<Order>(`${API_BASE_URL}/orders/${orderId}/items`, item);
  }

  updateItem(
    orderId: number,
    itemId: number,
    data: { quantity?: number; status?: string; is_takeaway?: boolean }
  ): Observable<unknown> {
    return this.http.put(`${API_BASE_URL}/orders/${orderId}/items/${itemId}`, data);
  }

  deleteItem(orderId: number, itemId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/orders/${orderId}/items/${itemId}`);
  }

  updateStatus(orderId: number, status: string): Observable<Order> {
    return this.http.put<Order>(`${API_BASE_URL}/orders/${orderId}/status`, { status });
  }

  updateGuestCount(orderId: number, guestCount: number): Observable<Order> {
    return this.http.put<Order>(`${API_BASE_URL}/orders/${orderId}/guests`, { guest_count: guestCount });
  }

  // ย้ายออเดอร์นั่งทานที่เปิดอยู่ไปยังโต๊ะอื่น (เช่น ลูกค้านั่งอยู่แล้วอยากย้ายที่นั่ง)
  changeTable(orderId: number, tableId: number): Observable<Order> {
    return this.http.put<Order>(`${API_BASE_URL}/orders/${orderId}/table`, { table_id: tableId });
  }

  updateDiscount(orderId: number, discountType: DiscountType, discountValue: number): Observable<Order> {
    return this.http.put<Order>(`${API_BASE_URL}/orders/${orderId}/discount`, {
      discount_type: discountType,
      discount_value: discountValue
    });
  }

  pay(orderId: number, method: PaymentMethod, receivedAmount: number, transferRef?: string): Observable<Order> {
    return this.http.post<Order>(`${API_BASE_URL}/orders/${orderId}/pay`, {
      method,
      received_amount: receivedAmount,
      transfer_ref: transferRef
    });
  }

  // แนบ/แก้ไขเลขอ้างอิงการโอน + รูปสลิปของบิลที่ปิดไปแล้ว (ตอนปิดบิลก็ได้ หรือย้อนหลังจากหน้ารายงานก็ได้)
  // ส่งฟิลด์ไหนก็แก้ไขเฉพาะฟิลด์นั้น ไม่ต้องส่งครบทั้งคู่
  uploadPaymentSlip(orderId: number, data: { ref?: string; slip?: File }): Observable<Payment> {
    const form = new FormData();
    if (data.ref !== undefined) {
      form.set('ref', data.ref);
    }
    if (data.slip) {
      form.set('slip', data.slip);
    }
    return this.http.put<Payment>(`${API_BASE_URL}/orders/${orderId}/payment`, form);
  }

  // ดาวน์โหลดไฟล์ PDF ใบเสร็จ/ใบกำกับภาษีอย่างย่อของบิลที่จ่ายเงินแล้ว (backend สร้างตอนเรียก ไม่ได้ cache ไว้)
  // ใช้ responseType: 'blob' เพราะ endpoint นี้ต้องแนบ Authorization header ผ่าน interceptor เหมือน
  // เรียก API อื่นๆ — เปิดลิงก์ตรงๆ ด้วย <a href> หรือ window.open(url) จะไม่แนบ header นี้ให้ ต้อง fetch
  // เป็น blob ในแอปก่อน แล้วค่อยเปิด blob URL ให้ผู้เรียกใช้ (ดู checkout.component.ts downloadInvoicePdf)
  downloadInvoicePdf(orderId: number): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/orders/${orderId}/invoice`, { responseType: 'blob' });
  }
}
