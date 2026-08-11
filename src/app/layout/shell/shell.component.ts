import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter, interval, startWith, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { OrderService } from '../../core/order.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit, OnDestroy {
  // overlay เมนู "เพิ่มเติม" (สเปก 5a) — เปิดจากปุ่มล่างของแถบไอคอนซ้าย (สเปก 5b)
  overlayOpen = signal(false);

  // ป้ายจำนวนออเดอร์ที่ยังไม่ปิดบิล (เปิดอยู่/กำลังทำ/เสิร์ฟแล้ว) โชว์ที่ไอคอน "ออเดอร์" — อัปเดตทุก 20 วิ
  openOrderCount = signal(0);
  private pollSub?: Subscription;

  // อัปเดตทุกครั้งที่เปลี่ยนหน้า ใช้เช็คว่าตอนนี้อยู่หน้าไหน (เช่น ปิด scroll ชั้นนอกเฉพาะหน้าคิดเงิน
  // ที่จัดการ scroll ภายในของตัวเองอยู่แล้ว ไม่ต้องการให้ scroll ซ้อนกัน 2 ชั้น)
  private currentUrl = signal('');

  // container ชั้นนอก (.content) ไม่ scroll อยู่แล้วทุกหน้า (ดู shell.component.scss) — full-bleed แค่ตัด
  // padding รอบนอกออกให้หน้าคิดเงินกว้างเต็มจอจริงๆ กดปุ่มต่างๆ ได้ง่ายขึ้น (หน้าอื่นไม่ต้องการ padding=0)
  isFullBleedPage = computed(() => this.currentUrl().startsWith('/checkout'));

  initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    return name.trim().charAt(0) || '?';
  });

  constructor(
    public auth: AuthService,
    private router: Router,
    private orderService: OrderService
  ) {
    this.currentUrl.set(this.router.url);
    // ปิด overlay อัตโนมัติทุกครั้งที่เปลี่ยนหน้า
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.overlayOpen.set(false);
      this.currentUrl.set((e as NavigationEnd).urlAfterRedirects);
    });
  }

  ngOnInit(): void {
    // โพลทุก 20 วินาที เอาไว้พอกะให้แคชเชียร์เห็นคิวค้างคร่าวๆ ไม่ต้องเป๊ะเรียลไทม์
    this.pollSub = interval(20000)
      .pipe(
        startWith(0),
        switchMap(() => this.orderService.listOrders())
      )
      .subscribe({
        next: (orders) => {
          const count = orders.filter(
            (o) => o.status === 'open' || o.status === 'preparing' || o.status === 'served'
          ).length;
          this.openOrderCount.set(count);
        },
        error: () => {
          // เงียบไว้พอ — ป้ายจำนวนไม่ใช่ข้อมูลสำคัญขนาดต้องแจ้ง error รบกวนแคชเชียร์
        }
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  toggleOverlay(): void {
    this.overlayOpen.set(!this.overlayOpen());
  }

  closeOverlay(): void {
    this.overlayOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
    // ออกจากระบบแล้วกลับไปหน้า PIN เป็นค่าเริ่มต้น (เร็วกว่าสำหรับคนถัดไปที่จะมาใช้เครื่องนี้ต่อ)
    this.router.navigate(['/pin-login']);
  }
}
