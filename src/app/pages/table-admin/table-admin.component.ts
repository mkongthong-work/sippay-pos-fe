import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableService } from '../../core/table.service';
import { ZoneService } from '../../core/zone.service';
import { ToastService } from '../../core/toast.service';
import { DiningTable, Zone } from '../../core/models';

// ใช้เป็นค่าพิเศษใน <select> โซน เพื่อสลับไปโชว์ช่องพิมพ์ชื่อโซนใหม่เอง
const CUSTOM_ZONE_VALUE = '__custom__';

@Component({
  selector: 'app-table-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-admin.component.html'
})
export class TableAdminComponent implements OnInit {
  tables = signal<DiningTable[]>([]);
  zones = signal<Zone[]>([]);

  activeTab = signal<'tables' | 'zones'>('tables');

  readonly customZoneValue = CUSTOM_ZONE_VALUE;

  // รายชื่อโซนทั้งหมด (จากตาราง Zone ที่จัดการแยกได้ในแท็บ "จัดการโซน") ให้เลือกซ้ำได้เร็วตอนเพิ่ม/แก้ไขโต๊ะ
  // แสดงทุกโซนไม่ว่าจะเปิดหรือปิดใช้งานอยู่ เพราะแอดมินยังควรมองเห็น/แก้ไขโต๊ะเดิมที่อยู่ในโซนปิดได้ตามปกติ
  // (ปิดใช้งานมีผลแค่ตอนพนักงานเลือกโต๊ะที่หน้าขาย ไม่ได้ล็อกหน้าจัดการนี้)
  zoneOptions = computed(() => this.zones().map((z) => z.name));

  // ---- สถานะ "กำลังทำงาน" ของปุ่มรายแถว (สลับเปิด-ปิดใช้งานโซน) — key เป็น zone id ----
  private busyZoneIds = signal<Set<number>>(new Set());

  isZoneBusy(id: number): boolean {
    return this.busyZoneIds().has(id);
  }

  private setZoneBusy(id: number, busy: boolean): void {
    const next = new Set(this.busyZoneIds());
    if (busy) next.add(id);
    else next.delete(id);
    this.busyZoneIds.set(next);
  }

  savingAddZone = signal(false);
  savingAddTable = signal(false);
  savingEditTable = signal(false);

  // ---- popup เพิ่มโต๊ะ ----
  addModalOpen = signal(false);
  newTableName = '';
  newTableZone = '';
  newTableZoneCustom = '';
  newTableCapacity: number | null = null;

  // ---- popup แก้ไขโต๊ะ ----
  editModalTable = signal<DiningTable | null>(null);
  editTableName = '';
  editTableZone = '';
  editTableZoneCustom = '';
  editTableCapacity: number | null = null;
  editTableStatus: 'available' | 'occupied' | 'reserved' = 'available';

  // ---- แท็บจัดการโซน ----
  newZoneName = '';

  constructor(
    private tableService: TableService,
    private zoneService: ZoneService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.reload();
    this.loadZones();
  }

  switchTab(tab: 'tables' | 'zones'): void {
    this.activeTab.set(tab);
  }

  reload(): void {
    this.tableService.getTables().subscribe({
      next: (tables) => this.tables.set(tables),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดรายการโต๊ะไม่สำเร็จ')
    });
  }

  // ---- แท็บจัดการโซน ----

  loadZones(): void {
    this.zoneService.getZones().subscribe({
      next: (zones) => this.zones.set(zones),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดรายการโซนไม่สำเร็จ')
    });
  }

  addZone(): void {
    if (this.savingAddZone()) return;
    const name = this.newZoneName.trim();
    if (!name) {
      this.toastService.error('กรอกชื่อโซน');
      return;
    }
    this.savingAddZone.set(true);
    this.zoneService.createZone(name).subscribe({
      next: () => {
        this.savingAddZone.set(false);
        this.newZoneName = '';
        this.loadZones();
      },
      error: (err) => {
        this.savingAddZone.set(false);
        this.toastService.error(err?.error?.error ?? 'เพิ่มโซนไม่สำเร็จ');
      }
    });
  }

  // เปิด/ปิดใช้งานโซน เช่น ปิดซ่อม หรือมีการจองที่นั่งไว้ทั้งโซน — โซนที่ปิดจะไม่โชว์ในหน้าเลือกโต๊ะของ POS
  toggleZoneActive(zone: Zone): void {
    if (this.isZoneBusy(zone.id)) return;
    this.setZoneBusy(zone.id, true);
    this.zoneService.updateZone(zone.id, { is_active: !zone.is_active }).subscribe({
      next: () => {
        this.setZoneBusy(zone.id, false);
        this.loadZones();
      },
      error: (err) => {
        this.setZoneBusy(zone.id, false);
        this.toastService.error(err?.error?.error ?? 'แก้ไขสถานะโซนไม่สำเร็จ');
      }
    });
  }

  // เพิ่มโซนใหม่ให้อัตโนมัติถ้าพิมพ์ชื่อโซนใหม่จากป็อปอัพเพิ่ม/แก้ไขโต๊ะ (กด "+ เพิ่มโซนใหม่...") เพื่อให้ไปโผล่
  // ในแท็บ "จัดการโซน" ด้วยเลย ไม่ต้องมาพิมพ์ซ้ำอีกที ถ้าสร้างไม่สำเร็จ (เช่นชื่อซ้ำ) ก็ยังสร้าง/แก้ไขโต๊ะต่อได้ตามปกติ
  private ensureZoneThenProceed(zoneName: string, proceed: () => void): void {
    if (!zoneName || this.zones().some((z) => z.name === zoneName)) {
      proceed();
      return;
    }
    this.zoneService.createZone(zoneName).subscribe({
      next: () => {
        this.loadZones();
        proceed();
      },
      error: () => proceed()
    });
  }

  // ---- เพิ่มโต๊ะ ----

  openAddModal(): void {
    this.newTableName = '';
    const zones = this.zoneOptions();
    this.newTableZone = zones.length > 0 ? zones[0] : CUSTOM_ZONE_VALUE;
    this.newTableZoneCustom = '';
    this.newTableCapacity = null;
    this.addModalOpen.set(true);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
  }

  addTable(): void {
    if (this.savingAddTable()) return;
    if (!this.newTableName.trim()) {
      this.toastService.error('กรอกชื่อโต๊ะ');
      return;
    }
    const zone =
      this.newTableZone === CUSTOM_ZONE_VALUE ? this.newTableZoneCustom.trim() : this.newTableZone;

    this.savingAddTable.set(true);
    this.ensureZoneThenProceed(zone, () => {
      this.tableService
        .createTable({
          name: this.newTableName,
          zone,
          capacity: this.newTableCapacity ?? 0
        })
        .subscribe({
          next: () => {
            this.savingAddTable.set(false);
            this.closeAddModal();
            this.reload();
          },
          error: (err) => {
            this.savingAddTable.set(false);
            this.toastService.error(err?.error?.error ?? 'เพิ่มโต๊ะไม่สำเร็จ');
          }
        });
    });
  }

  // ---- แก้ไขโต๊ะ ----

  openEditModal(table: DiningTable): void {
    this.editModalTable.set(table);
    this.editTableName = table.name;
    // ถ้าโต๊ะนี้มีโซนอยู่แล้ว จะอยู่ใน zoneOptions() เสมอ (มาจากการรวมโซนของโต๊ะทั้งหมด) เลือกให้ตรงได้ทันที
    this.editTableZone = table.zone || this.zoneOptions()[0] || CUSTOM_ZONE_VALUE;
    this.editTableZoneCustom = '';
    this.editTableCapacity = table.capacity || null;
    this.editTableStatus = table.status;
  }

  closeEditModal(): void {
    this.editModalTable.set(null);
  }

  saveEditTable(): void {
    if (this.savingEditTable()) return;
    const table = this.editModalTable();
    if (!table) return;
    if (!this.editTableName.trim()) {
      this.toastService.error('กรอกชื่อโต๊ะ');
      return;
    }
    const zone =
      this.editTableZone === CUSTOM_ZONE_VALUE ? this.editTableZoneCustom.trim() : this.editTableZone;

    this.savingEditTable.set(true);
    this.ensureZoneThenProceed(zone, () => {
      this.tableService
        .updateTable(table.id, {
          name: this.editTableName,
          zone,
          capacity: this.editTableCapacity ?? 0,
          status: this.editTableStatus
        })
        .subscribe({
          next: () => {
            this.savingEditTable.set(false);
            this.closeEditModal();
            this.reload();
          },
          error: (err) => {
            this.savingEditTable.set(false);
            this.toastService.error(err?.error?.error ?? 'แก้ไขโต๊ะไม่สำเร็จ');
          }
        });
    });
  }
}
