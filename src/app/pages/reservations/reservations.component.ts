import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableService } from '../../core/table.service';
import { ZoneService } from '../../core/zone.service';
import { ReservationService } from '../../core/reservation.service';
import { ToastService } from '../../core/toast.service';
import { DiningTable, Reservation, Zone } from '../../core/models';

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservations.component.html'
})
export class ReservationsComponent implements OnInit {
  reservations = signal<Reservation[]>([]);
  tables = signal<DiningTable[]>([]);
  zones = signal<Zone[]>([]);

  // โต๊ะที่เลือกกันไว้/จองไว้ได้ ต้องยังว่างอยู่ และไม่อยู่ในโซนที่ปิดใช้งาน
  availableTables = computed(() => {
    const inactiveZones = new Set(this.zones().filter((z) => !z.is_active).map((z) => z.name));
    return this.tables().filter((t) => t.status === 'available' && !inactiveZones.has(t.zone));
  });

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

  // ---- popup กันโต๊ะ/จองโต๊ะ ----
  addModalOpen = signal(false);
  newTableId: number | null = null;
  newCustomerName = '';
  newCustomerPhone = '';
  newPartySize: number | null = null;
  // false = กันโต๊ะไว้ตอนนี้เลย (ลูกค้ามาถึงร้านแล้ว), true = จองล่วงหน้าไว้เวลาที่ระบุ
  isAdvanceBooking = false;
  newReservedFor = ''; // ค่าจาก <input type="datetime-local">
  newNote = '';

  constructor(
    private tableService: TableService,
    private zoneService: ZoneService,
    private reservationService: ReservationService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.reload();
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
    this.zoneService.getZones().subscribe((zones) => this.zones.set(zones));
  }

  reload(): void {
    this.reservationService.listReservations().subscribe({
      next: (reservations) => this.reservations.set(reservations),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดรายการจองไม่สำเร็จ')
    });
  }

  private refreshTables(): void {
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
  }

  // ---- popup กันโต๊ะ/จองโต๊ะ ----

  openAddModal(): void {
    const tables = this.availableTables();
    this.newTableId = tables.length > 0 ? tables[0].id : null;
    this.newCustomerName = '';
    this.newCustomerPhone = '';
    this.newPartySize = null;
    this.isAdvanceBooking = false;
    this.newReservedFor = '';
    this.newNote = '';
    this.addModalOpen.set(true);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
  }

  addReservation(): void {
    if (!this.newTableId) {
      this.toastService.error('กรุณาเลือกโต๊ะ');
      return;
    }
    if (!this.newCustomerName.trim()) {
      this.toastService.error('กรุณากรอกชื่อลูกค้า');
      return;
    }
    if (this.isAdvanceBooking && !this.newReservedFor) {
      this.toastService.error('กรุณาระบุวันเวลาที่จอง');
      return;
    }

    this.reservationService
      .createReservation({
        table_id: this.newTableId,
        customer_name: this.newCustomerName.trim(),
        customer_phone: this.newCustomerPhone.trim() || undefined,
        party_size: this.newPartySize ?? undefined,
        reserved_for: this.isAdvanceBooking && this.newReservedFor ? new Date(this.newReservedFor).toISOString() : undefined,
        note: this.newNote.trim() || undefined
      })
      .subscribe({
        next: () => {
          this.closeAddModal();
          this.reload();
          this.refreshTables();
        },
        error: (err) => this.toastService.error(err?.error?.error ?? 'กันโต๊ะไม่สำเร็จ')
      });
  }

  cancelReservation(r: Reservation): void {
    this.reservationService.cancelReservation(r.id).subscribe({
      next: () => {
        this.reload();
        this.refreshTables();
      },
      error: (err) => this.toastService.error(err?.error?.error ?? 'ยกเลิกไม่สำเร็จ')
    });
  }

  markNoShow(r: Reservation): void {
    this.reservationService.markNoShow(r.id).subscribe({
      next: () => {
        this.reload();
        this.refreshTables();
      },
      error: (err) => this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ')
    });
  }

  reservedForLabel(r: Reservation): string {
    if (!r.reserved_for) return 'กันไว้ตอนนี้';
    return new Date(r.reserved_for).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
