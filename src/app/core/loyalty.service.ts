import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Member, MemberPointHistory, LoyaltySettings, PointAccumulationRule, RedemptionRule, TierRule } from './models';
import { API_BASE_URL } from './api-config';

export interface CreateMemberInput { name: string; phone: string; }
export interface UpdateMemberInput { name?: string; phone?: string; is_active?: boolean; }
export interface AdjustPointsInput { change: number; reason: string; }
export interface UpdateLoyaltySettingsInput {
  is_enabled: boolean;
  accumulation: PointAccumulationRule;
  redemption: RedemptionRule;
  tier_rules: TierRule[];
}

@Injectable({ providedIn: 'root' })
export class LoyaltyService {
  constructor(private http: HttpClient) {}

  getMembers(search?: string): Observable<Member[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.http.get<Member[]>(`${API_BASE_URL}/members${params}`);
  }

  getMember(id: number): Observable<Member> {
    return this.http.get<Member>(`${API_BASE_URL}/members/${id}`);
  }

  getMemberByPhone(phone: string): Observable<Member> {
    return this.http.get<Member>(`${API_BASE_URL}/members/by-phone/${encodeURIComponent(phone)}`);
  }

  createMember(data: CreateMemberInput): Observable<Member> {
    return this.http.post<Member>(`${API_BASE_URL}/members`, data);
  }

  updateMember(id: number, data: UpdateMemberInput): Observable<Member> {
    return this.http.put<Member>(`${API_BASE_URL}/members/${id}`, data);
  }

  getMemberHistory(memberId: number): Observable<MemberPointHistory[]> {
    return this.http.get<MemberPointHistory[]>(`${API_BASE_URL}/members/${memberId}/history`);
  }

  adjustPoints(memberId: number, data: AdjustPointsInput): Observable<Member> {
    return this.http.post<Member>(`${API_BASE_URL}/members/${memberId}/adjust-points`, data);
  }

  getLoyaltySettings(): Observable<LoyaltySettings> {
    return this.http.get<LoyaltySettings>(`${API_BASE_URL}/loyalty-settings`);
  }

  updateLoyaltySettings(data: UpdateLoyaltySettingsInput): Observable<LoyaltySettings> {
    return this.http.put<LoyaltySettings>(`${API_BASE_URL}/loyalty-settings`, data);
  }
}
