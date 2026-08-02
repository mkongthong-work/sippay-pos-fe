import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableService } from '../../core/table.service';
import { DiningTable } from '../../core/models';

@Component({
  selector: 'app-table-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-admin.component.html'
})
export class TableAdminComponent implements OnInit {
  tables = signal<DiningTable[]>([]);
  message = signal<string | null>(null);

  // ---- popup เพิ่มโต๊ะ ----
  addModalOpen = signal(false);
  newTableName = '';
  newTableZone = '';
  newTableCapacity: number | null = null;

  // ---- popup แก้ไขโต๊ะ ----
  editModalTable = signal<DiningTable | null>(null);
  editTableName = '';
  editTableZone = '';
  editTableCapacity: number | null = null;
  editTableStatus: 'available' | 'occupied' = 'available';

  constructor(private tableService: TableService) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.tableService.getTables().subscribe({
      next: (tables) => this.tables.set(tables),
      error: (err) => this.message.set(err?.error?.error ?? 'โหลดรายการโต๊ะไม่สำเร็จ')
    });
  }

  // ---- เพิ่มโต๊ะ ----

  openAddModal(): void {
    this.newTableName = '';
    this.newTableZone = '';
    this.newTableCapacity = null;
    this.message.set(null);
    this.addModalOpen.set(true);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
  }

  addTable(): void {
    if (!this.newTableName.trim()) {
      this.message.set('กรอกชื่อโต๊ะ');
      return;
    }
    this.tableService
      .createTable({
        name: this.newTableName,
        zone: this.newTableZone,
        capacity: this.newTableCapacity ?? 0
      })
      .subscribe({
        next: () => {
          this.message.set(null);
          this.closeAddModal();
          this.reload();
        },
        error: (err) => this.message.set(err?.error?.error ?? 'เพิ่มโต๊ะไม่สำเร็จ')
      });
  }

  // ---- แก้ไขโต๊ะ ----

  openEditModal(table: DiningTable): void {
    this.editModalTable.set(table);
    this.editTableName = table.name;
    this.editTableZone = table.zone;
    this.editTableCapacity = table.capacity || null;
    this.editTableStatus = table.status;
    this.message.set(null);
  }

  closeEditModal(): void {
    this.editModalTable.set(null);
  }

  saveEditTable(): void {
    const table = this.editModalTable();
    if (!table) return;
    if (!this.editTableName.trim()) {
      this.message.set('กรอกชื่อโต๊ะ');
      return;
    }
    this.tableService
      .updateTable(table.id, {
        name: this.editTableName,
        zone: this.editTableZone,
        capacity: this.editTableCapacity ?? 0,
        status: this.editTableStatus
      })
      .subscribe({
        next: () => {
          this.message.set(null);
          this.closeEditModal();
          this.reload();
        },
        error: (err) => this.message.set(err?.error?.error ?? 'แก้ไขโต๊ะไม่สำเร็จ')
      });
  }
}
