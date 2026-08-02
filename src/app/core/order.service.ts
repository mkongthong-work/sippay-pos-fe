import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { DiscountType, Order, OrderType } from './models';
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

  updateDiscount(orderId: number, discountType: DiscountType, discountValue: number): Observable<Order> {
    return this.http.put<Order>(`${API_BASE_URL}/orders/${orderId}/discount`, {
      discount_type: discountType,
      discount_value: discountValue
    });
  }

  pay(orderId: number, method: string, receivedAmount: number): Observable<Order> {
    return this.http.post<Order>(`${API_BASE_URL}/orders/${orderId}/pay`, {
      method,
      received_amount: receivedAmount
    });
  }
}
