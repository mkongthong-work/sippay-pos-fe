import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';

import { ReportService } from '../../core/report.service';
import { OrderService } from '../../core/order.service';
import { ShopSettingsService } from '../../core/shop-settings.service';
import { ToastService } from '../../core/toast.service';
import { DailyReport, Order, ReportOrderSummary, SalesRangeReport, ShopSettings } from '../../core/models';
import { resolveMediaUrl } from '../../core/api-config';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';

Chart.register(...registerables);

// ดีไซน์ 7c: รวม 2 แท็บเดิม (รายวัน/แนวโน้ม) เป็นหน้าเดียว สลับช่วงเวลาด้วยปุ่มกลุ่มเดียว
// 'today'/'custom' = มุมมองรายวันเต็มรูปแบบ (การ์ดสรุป + กราฟช่วงเวลา + เมนูขายดี + ตารางบิล)
// '7d'/'30d' = มุมมองแนวโน้มแบบช่วง (การ์ดสรุปรวม + กราฟเส้น เท่านั้น ไม่มีตารางบิลเพราะข้อมูลเยอะเกินจะแสดงทีละบิล)
type PeriodMode = 'today' | '7d' | '30d' | 'custom';
type BillFilter = 'all' | 'cash' | 'transfer' | 'no_slip';

const THAI_MONTHS_SHORT = [
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

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ReceiptComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit, OnDestroy {
  periodMode = signal<PeriodMode>('today');

  // ---- มุมมองรายวัน (today / custom) ----
  selectedDate = new Date().toISOString().slice(0, 10);
  report = signal<DailyReport | null>(null);
  loading = signal(false);
  loadError = signal(false);

  @ViewChild('hourlyCanvas') hourlyCanvasRef?: ElementRef<HTMLCanvasElement>;
  private hourlyChart?: Chart;

  billFilter = signal<BillFilter>('all');

  // ---- มุมมองแนวโน้ม (7 วัน / 30 วัน) ----
  trendReport = signal<SalesRangeReport | null>(null);
  trendLoading = signal(false);
  trendError = signal(false);

  @ViewChild('trendCanvas') trendCanvasRef?: ElementRef<HTMLCanvasElement>;
  private trendChart?: Chart;

  // ---- popup แนบ/แก้ไขสลิปโอนเงินย้อนหลัง (ใช้กับตารางประวัติบิลของมุมมองรายวัน) ----
  slipModalOrder = signal<ReportOrderSummary | null>(null);
  slipModalRef = '';
  slipModalFile: File | null = null;
  slipModalFileName = '';
  slipModalSaving = signal(false);

  // ---- พิมพ์ใบเสร็จซ้ำจากประวัติบิล ----
  receiptOrder = signal<Order | null>(null);
  receiptLoading = signal(false);
  shopSettings = signal<ShopSettings | null>(null);

  constructor(
    private reportService: ReportService,
    private orderService: OrderService,
    private shopSettingsService: ShopSettingsService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.hourlyChart?.destroy();
    this.trendChart?.destroy();
  }

  // ---- สลับช่วงเวลา ----

  setPeriod(mode: PeriodMode): void {
    this.periodMode.set(mode);
    this.billFilter.set('all');
    if (mode === 'today') {
      this.selectedDate = new Date().toISOString().slice(0, 10);
      this.load();
    } else if (mode === '7d' || mode === '30d') {
      this.loadTrend(mode);
    }
    // mode === 'custom' — แค่โชว์ช่องเลือกวันที่ ยังไม่โหลดจนกว่าจะเลือกวันจริง (onCustomDateChange)
  }

  onCustomDateChange(): void {
    this.periodMode.set('custom');
    this.billFilter.set('all');
    this.load();
  }

  headerDateLabel = computed(() => {
    const mode = this.periodMode();
    if (mode === '7d' || mode === '30d') {
      const r = this.trendReport();
      if (!r) return '';
      return `${this.formatThaiDateShort(r.from)} – ${this.formatThaiDateShort(r.to)}`;
    }
    return this.formatThaiDateLong(this.selectedDate);
  });

  private formatThaiDateShort(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
  }

  private formatThaiDateLong(dateStr: string): string {
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const d = new Date(dateStr + 'T00:00:00');
    return `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
  }

  // ---- มุมมองรายวัน ----

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.reportService.getDaily(this.selectedDate).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
        // ต้องรอ Angular render @if บล็อกที่มี <canvas> ก่อน ถึงจะมี element จริงให้วาดกราฟลงไป
        setTimeout(() => this.renderHourlyChart(r), 0);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      }
    });
  }

  private renderHourlyChart(r: DailyReport): void {
    // ยอดขายแยกตามชั่วโมงที่ปิดบิล (0-23) จาก orders[].paid_at ของวันที่เลือก
    const hourly = new Array(24).fill(0);
    for (const o of r.orders) {
      const hour = new Date(o.paid_at).getHours();
      hourly[hour] += o.total_amount;
    }
    this.hourlyChart?.destroy();
    if (this.hourlyCanvasRef) {
      this.hourlyChart = new Chart(this.hourlyCanvasRef.nativeElement, {
        type: 'bar',
        data: {
          labels: hourly.map((_, h) => `${h}:00`),
          datasets: [
            {
              label: 'ยอดขาย (บาท)',
              data: hourly,
              backgroundColor: hourly.map((v) => (v === Math.max(...hourly) && v > 0 ? '#2E8B84' : '#8992A9')),
              borderRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { display: false }, grid: { display: false } },
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }
          }
        }
      });
    }
  }

  // ---- การ์ดสรุป: มุมมองรายวัน ----

  dineInCount = computed(() => this.report()?.orders.filter((o) => o.order_type === 'dine_in').length ?? 0);
  takeawayCount = computed(() => this.report()?.orders.filter((o) => o.order_type === 'takeaway').length ?? 0);

  avgPerBill = computed(() => {
    const r = this.report();
    if (!r || r.order_count === 0) return 0;
    return r.total_sales / r.order_count;
  });

  maxBill = computed(() => {
    const r = this.report();
    if (!r || r.orders.length === 0) return 0;
    return Math.max(...r.orders.map((o) => o.total_amount));
  });

  cashCount = computed(() => this.report()?.orders.filter((o) => o.payment_method === 'cash').length ?? 0);
  transferCount = computed(() => this.report()?.orders.filter((o) => o.payment_method === 'transfer').length ?? 0);
  noSlipCount = computed(
    () => this.report()?.orders.filter((o) => o.payment_method === 'transfer' && !o.slip_image_path).length ?? 0
  );

  // ---- เมนูขายดี 5 อันดับ — แสดงเป็นแท่ง progress bar เทียบกับอันดับ 1 (แทนกราฟแท่ง Chart.js เดิม) ----
  topItemsRanked = computed(() => {
    const r = this.report();
    if (!r) return [];
    const sorted = [...r.top_items].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const max = sorted[0]?.quantity ?? 1;
    return sorted.map((item) => ({ ...item, percent: max > 0 ? Math.round((item.quantity / max) * 100) : 0 }));
  });

  // ---- ตารางบิล: ตัวกรองแบบชิปแตะเลือก ----
  filteredOrders = computed(() => {
    const orders = this.report()?.orders ?? [];
    const filter = this.billFilter();
    if (filter === 'cash') return orders.filter((o) => o.payment_method === 'cash');
    if (filter === 'transfer') return orders.filter((o) => o.payment_method === 'transfer');
    if (filter === 'no_slip') return orders.filter((o) => o.payment_method === 'transfer' && !o.slip_image_path);
    return orders;
  });

  setBillFilter(filter: BillFilter): void {
    this.billFilter.set(filter);
  }

  // คลิกทั้งแถวเพื่อเปิดใบเสร็จ — ยกเว้นบิลโอนเงินที่ยังไม่แนบสลิป จะเปิดหน้าต่างแนบสลิปแทน
  onBillRowClick(o: ReportOrderSummary): void {
    if (o.payment_method === 'transfer' && !o.slip_image_path) {
      this.openSlipModal(o);
    } else {
      this.openReceipt(o);
    }
  }

  exportBillsCsv(): void {
    const orders = this.filteredOrders();
    if (orders.length === 0) {
      this.toastService.info('ไม่มีบิลให้ส่งออก');
      return;
    }
    const header = ['บิล', 'ประเภท', 'โต๊ะ', 'ยอด', 'เปิดบิลโดย', 'ปิดบิลโดย', 'เวลาปิด', 'ชำระโดย'];
    const rows = orders.map((o) => [
      `#${o.order_id}`,
      o.order_type === 'dine_in' ? 'นั่งทาน' : 'ซื้อกลับ',
      o.table_name || '',
      o.total_amount.toFixed(2),
      o.created_by_name || '',
      o.paid_by_name || '',
      new Date(o.paid_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      o.payment_method === 'transfer' ? 'โอนเงิน' : 'เงินสด'
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sippay-bills-${this.selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- มุมมองแนวโน้ม (7 วัน / 30 วัน) ----

  private loadTrend(mode: '7d' | '30d'): void {
    const today = new Date();
    const toStr = today.toISOString().slice(0, 10);
    const daysBack = mode === '7d' ? 6 : 29;
    const from = new Date(today);
    from.setDate(from.getDate() - daysBack);
    const fromStr = from.toISOString().slice(0, 10);

    this.trendLoading.set(true);
    this.trendError.set(false);
    this.reportService.getRange(fromStr, toStr).subscribe({
      next: (r) => {
        this.trendReport.set(r);
        this.trendLoading.set(false);
        setTimeout(() => this.renderTrendChart(r), 0);
      },
      error: () => {
        this.trendLoading.set(false);
        this.trendError.set(true);
      }
    });
  }

  trendTotal = computed(() => this.trendReport()?.days.reduce((sum, d) => sum + d.total_sales, 0) ?? 0);
  trendOrderCount = computed(() => this.trendReport()?.days.reduce((sum, d) => sum + d.order_count, 0) ?? 0);
  trendAvgPerBill = computed(() => {
    const count = this.trendOrderCount();
    return count === 0 ? 0 : this.trendTotal() / count;
  });

  trendBestDay = computed(() => {
    const days = this.trendReport()?.days ?? [];
    if (days.length === 0) return null;
    return days.reduce((best, d) => (d.total_sales > best.total_sales ? d : best), days[0]);
  });

  trendBestDayLabel = computed(() => {
    const best = this.trendBestDay();
    return best ? this.formatThaiDateShort(best.date) : '-';
  });

  private renderTrendChart(r: SalesRangeReport): void {
    this.trendChart?.destroy();
    if (!this.trendCanvasRef) return;
    this.trendChart = new Chart(this.trendCanvasRef.nativeElement, {
      type: 'line',
      data: {
        // ตัดเหลือแค่ MM-DD กันแกน x ยาวเกิน
        labels: r.days.map((d) => d.date.slice(5)),
        datasets: [
          {
            label: 'ยอดขาย (บาท)',
            data: r.days.map((d) => d.total_sales),
            borderColor: '#2E8B84',
            backgroundColor: 'rgba(46, 139, 132, 0.12)',
            fill: true,
            tension: 0.25,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // ---- แนบ/แก้ไขสลิปโอนเงินย้อนหลัง ----

  slipUrl(o: ReportOrderSummary): string | null {
    return resolveMediaUrl(o.slip_image_path);
  }

  openSlipModal(o: ReportOrderSummary): void {
    this.slipModalOrder.set(o);
    this.slipModalRef = o.transfer_ref || '';
    this.slipModalFile = null;
    this.slipModalFileName = '';
  }

  closeSlipModal(): void {
    this.slipModalOrder.set(null);
  }

  onSlipModalFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.slipModalFile = file;
    this.slipModalFileName = file?.name ?? '';
  }

  saveSlipModal(): void {
    const o = this.slipModalOrder();
    if (!o) return;
    this.slipModalSaving.set(true);
    this.orderService
      .uploadPaymentSlip(o.order_id, {
        ref: this.slipModalRef,
        slip: this.slipModalFile ?? undefined
      })
      .subscribe({
        next: () => {
          this.slipModalSaving.set(false);
          this.closeSlipModal();
          this.load(); // โหลดตารางประวัติบิลใหม่ ให้เห็นสถานะสลิป/เลขอ้างอิงล่าสุด
        },
        error: (err) => {
          this.slipModalSaving.set(false);
          this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ');
        }
      });
  }

  // ---- พิมพ์ใบเสร็จซ้ำจากประวัติบิล ----

  openReceipt(o: ReportOrderSummary): void {
    if (!this.shopSettings()) {
      this.shopSettingsService.getShopSettings().subscribe((s) => this.shopSettings.set(s));
    }
    this.receiptLoading.set(true);
    this.orderService.getOrder(o.order_id).subscribe({
      next: (order) => {
        this.receiptLoading.set(false);
        this.receiptOrder.set(order);
      },
      error: () => this.receiptLoading.set(false)
    });
  }

  closeReceipt(): void {
    this.receiptOrder.set(null);
  }
}
