import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { LoyaltyService } from '../../core/loyalty.service';
import { Member, MemberPointHistory, LoyaltySettings, TierRule, MemberTier } from '../../core/models';

let mockMembers: Member[] = [
  { id: 1, name: 'สมหญิง ใจดี', phone: '0812345678', points_balance: 320, tier: 'gold', total_spent: 12500, is_active: true, created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' },
  { id: 2, name: 'วิชัย มีสุข', phone: '0898765432', points_balance: 80, tier: 'bronze', total_spent: 2100, is_active: true, created_at: '2025-02-05T09:00:00Z', updated_at: '2025-02-05T09:00:00Z' },
  { id: 3, name: 'นิดา สว่าง', phone: '0856781234', points_balance: 1050, tier: 'platinum', total_spent: 45000, is_active: true, created_at: '2024-11-20T14:00:00Z', updated_at: '2024-11-20T14:00:00Z' },
  { id: 4, name: 'ประสิทธิ์ ดีงาม', phone: '0621239876', points_balance: 0, tier: 'silver', total_spent: 6800, is_active: false, created_at: '2025-03-01T11:00:00Z', updated_at: '2025-03-01T11:00:00Z' },
];
let mockNextId = 5;

const MOCK_HISTORY: MemberPointHistory[] = [
  { id: 1, member_id: 1, order_id: 101, change: 48, reason: 'ซื้อสินค้า', created_at: '2025-07-01T12:30:00Z' },
  { id: 2, member_id: 1, order_id: null, change: -100, reason: 'แลกส่วนลด', created_at: '2025-06-20T15:00:00Z' },
  { id: 3, member_id: 1, order_id: 95, change: 120, reason: 'ซื้อสินค้า', created_at: '2025-06-15T11:00:00Z' },
];

const MOCK_SETTINGS: LoyaltySettings = {
  id: 1,
  is_enabled: true,
  accumulation: { spend_per_point: 25, points_expiry_days: 365, min_spend_to_earn: 0 },
  redemption: { points_per_baht: 10, min_points_to_redeem: 50, max_discount_ratio: 0.2 },
  tier_rules: [
    { tier: 'bronze' as MemberTier, label: 'Bronze', min_total_spent: 0, points_multiplier: 1 },
    { tier: 'silver' as MemberTier, label: 'Silver', min_total_spent: 5000, points_multiplier: 1.25 },
    { tier: 'gold' as MemberTier, label: 'Gold', min_total_spent: 10000, points_multiplier: 1.5 },
    { tier: 'platinum' as MemberTier, label: 'Platinum', min_total_spent: 30000, points_multiplier: 2 },
  ],
  updated_at: new Date().toISOString(),
};

const THAI_MONTHS_SHORT = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'
];

@Component({
  selector: 'app-loyalty',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './loyalty.component.html',
  styleUrl: './loyalty.component.scss'
})
export class LoyaltyComponent implements OnInit {
  activeTab = signal<'members' | 'settings'>('members');

  // ===== Members tab =====
  members = signal<Member[]>([]);
  membersLoading = signal(false);
  searchQuery = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  selectedMember = signal<Member | null>(null);
  memberHistory = signal<MemberPointHistory[]>([]);
  historyLoading = signal(false);

  // สถานะ "กำลังทำงาน" ของปุ่มสลับเปิด-ปิดใช้งานสมาชิกรายแถว — key เป็น member id
  private busyToggleIds = signal<Set<number>>(new Set());

  isToggleBusy(id: number): boolean {
    return this.busyToggleIds().has(id);
  }

  private setToggleBusy(id: number, busy: boolean): void {
    const next = new Set(this.busyToggleIds());
    if (busy) next.add(id);
    else next.delete(id);
    this.busyToggleIds.set(next);
  }

  // Modal: เพิ่มสมาชิก
  addModalOpen = signal(false);
  newName = '';
  newPhone = '';
  addSaving = signal(false);

  // Modal: แก้ไขสมาชิก
  editModalMember = signal<Member | null>(null);
  editName = '';
  editPhone = '';
  editSaving = signal(false);

  // Modal: ปรับแต้ม (admin only)
  adjustModalMember = signal<Member | null>(null);
  adjustChange = 0;
  adjustReason = '';
  adjustSaving = signal(false);

  // ===== Settings tab =====
  settingsLoading = signal(true);
  settingsSaving = signal(false);

  draftEnabled = false;
  draftSpendPerPoint = 25;
  draftPointsExpiryDays = 0;
  draftMinSpendToEarn = 0;
  draftPointsPerBaht = 10;
  draftMinPointsToRedeem = 50;
  draftMaxDiscountPercent = 20;
  draftTierRules: TierRule[] = [];

  isAdmin = computed(() => this.auth.user()?.role === 'admin');

  constructor(
    public auth: AuthService,
    private loyaltyService: LoyaltyService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadMembers();
    this.loadSettings();
  }

  // ===== Members =====

  loadMembers(search?: string): void {
    this.membersLoading.set(true);
    this.loyaltyService.getMembers(search).subscribe({
      next: (list) => {
        this.members.set(list);
        this.membersLoading.set(false);
      },
      error: (err) => {
        if (err?.status !== 404) {
          this.toast.error(err?.error?.error ?? 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
        }
        const q = (search ?? '').toLowerCase();
        this.members.set(q ? mockMembers.filter(m => m.name.includes(q) || m.phone.includes(q)) : [...mockMembers]);
        this.membersLoading.set(false);
      }
    });
  }

  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadMembers(this.searchQuery || undefined), 300);
  }

  selectMember(m: Member): void {
    this.selectedMember.set(m);
    this.loadHistory(m.id);
  }

  clearSelection(): void {
    this.selectedMember.set(null);
    this.memberHistory.set([]);
  }

  loadHistory(memberId: number): void {
    this.historyLoading.set(true);
    this.loyaltyService.getMemberHistory(memberId).subscribe({
      next: (h) => {
        this.memberHistory.set(h);
        this.historyLoading.set(false);
      },
      error: () => {
        this.memberHistory.set(MOCK_HISTORY.filter(h => h.member_id === memberId));
        this.historyLoading.set(false);
      }
    });
  }

  // Modal: เพิ่มสมาชิก
  openAddModal(): void {
    this.newName = '';
    this.newPhone = '';
    this.addModalOpen.set(true);
  }

  closeAddModal(): void { this.addModalOpen.set(false); }

  saveMember(): void {
    if (!this.newName.trim()) { this.toast.error('กรอกชื่อสมาชิก'); return; }
    if (!/^\d{9,10}$/.test(this.newPhone.trim())) { this.toast.error('เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก'); return; }
    this.addSaving.set(true);
    this.loyaltyService.createMember({ name: this.newName.trim(), phone: this.newPhone.trim() }).subscribe({
      next: () => { this.closeAddModal(); this.loadMembers(this.searchQuery || undefined); this.addSaving.set(false); },
      error: (err) => {
        if (err?.status === 404) {
          const newMember: Member = { id: mockNextId++, name: this.newName.trim(), phone: this.newPhone.trim(), points_balance: 0, tier: 'bronze', total_spent: 0, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          mockMembers = [newMember, ...mockMembers];
          this.closeAddModal();
          this.loadMembers(this.searchQuery || undefined);
        } else {
          this.toast.error(err?.error?.error ?? 'เพิ่มสมาชิกไม่สำเร็จ');
        }
        this.addSaving.set(false);
      }
    });
  }

  // Modal: แก้ไขสมาชิก
  openEditModal(m: Member): void {
    this.editModalMember.set(m);
    this.editName = m.name;
    this.editPhone = m.phone;
  }

  closeEditModal(): void { this.editModalMember.set(null); }

  saveEditMember(): void {
    const m = this.editModalMember();
    if (!m) return;
    if (!this.editName.trim()) { this.toast.error('กรอกชื่อสมาชิก'); return; }
    if (!/^\d{9,10}$/.test(this.editPhone.trim())) { this.toast.error('เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก'); return; }
    this.editSaving.set(true);
    this.loyaltyService.updateMember(m.id, { name: this.editName.trim(), phone: this.editPhone.trim() }).subscribe({
      next: (updated) => {
        this.editSaving.set(false);
        this.closeEditModal();
        this.loadMembers(this.searchQuery || undefined);
        if (this.selectedMember()?.id === m.id) this.selectedMember.set(updated);
        this.toast.success('แก้ไขสมาชิกเรียบร้อย');
      },
      error: (err) => {
        if (err?.status === 404) {
          mockMembers = mockMembers.map(x => x.id === m.id ? { ...x, name: this.editName.trim(), phone: this.editPhone.trim() } : x);
          const updated = mockMembers.find(x => x.id === m.id)!;
          this.editSaving.set(false);
          this.closeEditModal();
          this.loadMembers(this.searchQuery || undefined);
          if (this.selectedMember()?.id === m.id) this.selectedMember.set(updated);
          this.toast.success('แก้ไขสมาชิกเรียบร้อย');
        } else {
          this.editSaving.set(false);
          this.toast.error(err?.error?.error ?? 'แก้ไขไม่สำเร็จ');
        }
      }
    });
  }

  toggleActive(m: Member): void {
    if (this.isToggleBusy(m.id)) return;
    this.setToggleBusy(m.id, true);
    this.loyaltyService.updateMember(m.id, { is_active: !m.is_active }).subscribe({
      next: (updated) => {
        this.setToggleBusy(m.id, false);
        this.loadMembers(this.searchQuery || undefined);
        if (this.selectedMember()?.id === m.id) this.selectedMember.set(updated);
      },
      error: (err) => {
        this.setToggleBusy(m.id, false);
        if (err?.status === 404) {
          mockMembers = mockMembers.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x);
          const updated = mockMembers.find(x => x.id === m.id)!;
          this.loadMembers(this.searchQuery || undefined);
          if (this.selectedMember()?.id === m.id) this.selectedMember.set(updated);
        } else {
          this.toast.error(err?.error?.error ?? 'แก้ไขสถานะไม่สำเร็จ');
        }
      }
    });
  }

  // Modal: ปรับแต้ม
  openAdjustModal(m: Member): void {
    this.adjustModalMember.set(m);
    this.adjustChange = 0;
    this.adjustReason = '';
  }

  closeAdjustModal(): void { this.adjustModalMember.set(null); }

  saveAdjust(): void {
    const m = this.adjustModalMember();
    if (!m) return;
    if (this.adjustChange === 0) { this.toast.error('ระบุจำนวนแต้มที่ต้องการปรับ'); return; }
    if (!this.adjustReason.trim()) { this.toast.error('กรอกเหตุผลการปรับแต้ม'); return; }
    this.adjustSaving.set(true);
    this.loyaltyService.adjustPoints(m.id, { change: this.adjustChange, reason: this.adjustReason.trim() }).subscribe({
      next: (updated) => {
        this.adjustSaving.set(false);
        this.closeAdjustModal();
        if (this.selectedMember()?.id === m.id) {
          this.selectedMember.set(updated);
          this.loadHistory(m.id);
        }
        this.loadMembers(this.searchQuery || undefined);
        this.toast.success('ปรับแต้มเรียบร้อย');
      },
      error: (err) => {
        if (err?.status === 404) {
          mockMembers = mockMembers.map(x => x.id === m.id ? { ...x, points_balance: x.points_balance + this.adjustChange } : x);
          const updated = mockMembers.find(x => x.id === m.id)!;
          this.adjustSaving.set(false);
          this.closeAdjustModal();
          if (this.selectedMember()?.id === m.id) { this.selectedMember.set(updated); this.loadHistory(m.id); }
          this.loadMembers(this.searchQuery || undefined);
          this.toast.success('ปรับแต้มเรียบร้อย');
        } else {
          this.adjustSaving.set(false);
          this.toast.error(err?.error?.error ?? 'ปรับแต้มไม่สำเร็จ');
        }
      }
    });
  }

  // ===== Helpers =====

  tierLabel(tier: string): string {
    const labels: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
    return labels[tier] ?? tier;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ===== Settings =====

  loadSettings(): void {
    this.settingsLoading.set(true);
    this.loyaltyService.getLoyaltySettings().subscribe({
      next: (s) => { this.populateDraft(s); this.settingsLoading.set(false); },
      error: (err) => {
        if (err?.status !== 404) this.toast.error(err?.error?.error ?? 'โหลดการตั้งค่าไม่สำเร็จ');
        this.populateDraft(MOCK_SETTINGS);
        this.settingsLoading.set(false);
      }
    });
  }

  private populateDraft(s: LoyaltySettings): void {
    this.draftEnabled = s.is_enabled;
    this.draftSpendPerPoint = s.accumulation.spend_per_point;
    this.draftPointsExpiryDays = s.accumulation.points_expiry_days;
    this.draftMinSpendToEarn = s.accumulation.min_spend_to_earn;
    this.draftPointsPerBaht = s.redemption.points_per_baht;
    this.draftMinPointsToRedeem = s.redemption.min_points_to_redeem;
    this.draftMaxDiscountPercent = Math.round(s.redemption.max_discount_ratio * 100);
    this.draftTierRules = s.tier_rules.map(t => ({ ...t }));
  }

  saveSettings(): void {
    if (this.draftSpendPerPoint <= 0 || this.draftPointsPerBaht <= 0) {
      this.toast.error('อัตราสะสมแต้มและอัตราแลกแต้มต้องมากกว่า 0');
      return;
    }
    this.settingsSaving.set(true);
    this.loyaltyService.updateLoyaltySettings({
      is_enabled: this.draftEnabled,
      accumulation: { spend_per_point: this.draftSpendPerPoint, points_expiry_days: this.draftPointsExpiryDays, min_spend_to_earn: this.draftMinSpendToEarn },
      redemption: { points_per_baht: this.draftPointsPerBaht, min_points_to_redeem: this.draftMinPointsToRedeem, max_discount_ratio: this.draftMaxDiscountPercent / 100 },
      tier_rules: this.draftTierRules
    }).subscribe({
      next: (s) => { this.populateDraft(s); this.settingsSaving.set(false); this.toast.success('บันทึกการตั้งค่าเรียบร้อย'); },
      error: (err) => { this.settingsSaving.set(false); this.toast.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ'); }
    });
  }
}
