import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { ShopSettings } from './models';
import { API_BASE_URL } from './api-config';

export type UpdateShopSettingsInput = Pick<
  ShopSettings,
  'name' | 'address' | 'phone' | 'tax_id' | 'promptpay_id' | 'promptpay_name'
>;

@Injectable({ providedIn: 'root' })
export class ShopSettingsService {
  constructor(private http: HttpClient) {}

  getShopSettings(): Observable<ShopSettings> {
    return this.http.get<ShopSettings>(`${API_BASE_URL}/shop-settings`);
  }

  updateShopSettings(data: UpdateShopSettingsInput): Observable<ShopSettings> {
    return this.http.put<ShopSettings>(`${API_BASE_URL}/shop-settings`, data);
  }
}
