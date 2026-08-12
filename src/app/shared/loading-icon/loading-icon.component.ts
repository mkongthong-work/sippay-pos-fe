import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// ไอคอน loading แบบวนสลับรูปอาหาร 6 แบบ (ก็อปมาจากไฟล์ SVG ที่ผู้ใช้ส่งมา)
// ฝัง markup ตรงนี้เลยแทนที่จะโหลดจาก assets เพื่อให้ CSS ควบคุม animation ของแต่ละ <g class="f"> ได้
// variant 'light' = พื้นขาว เส้นสีเข้ม ใช้บนพื้นหลังสว่าง (เช่น หน้าขาย/หน้าออร์เดอร์)
// variant 'dark'  = พื้นโปร่งแสงขาว เส้นพาสเทล ใช้บนพื้นหลังเข้ม (เช่น หน้า splash/loading เต็มจอ)
@Component({
  selector: 'app-loading-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="loading-icon-wrap"
      [class.loading-icon-wrap--inline]="inline"
      [class.loading-icon-wrap--fullpage]="fullpage"
    >
      @if (variant === 'dark') {
        <svg
          class="loading-icon-svg"
          [attr.width]="size"
          [attr.height]="size"
          viewBox="0 0 80 80"
          role="img"
          [attr.aria-label]="label || 'กำลังเตรียมหน้าร้าน'"
        >
          <rect x=".5" y=".5" width="79" height="79" rx="24" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".16"></rect>
          <g class="f" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M3.5 13.5h17a8.5 8.5 0 0 1-17 0Z"></path><path d="M2.5 17.8h19"></path><path d="M9 10.6c0-1.5 1.1-1.9 1.1-2.9s-1.1-1.3-1.1-2.4M14 10.6c0-1.5 1.1-1.9 1.1-2.9S14 6.4 14 5.3"></path></g>
          <g class="f" fill="none" stroke="#F0D9AE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M4 12.5h13a6.5 6.5 0 0 1-13 0Z"></path><path d="M4.5 15.5h12"></path><path d="M14.5 3.5 8.5 12M17.5 4.5 11 12"></path></g>
          <g class="f" fill="none" stroke="#7FD6CE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M5.5 10.5h13l-.9 6.6a2.2 2.2 0 0 1-2.2 1.9H8.6a2.2 2.2 0 0 1-2.2-1.9l-.9-6.6Z"></path><path d="M5.5 12.8H3.4M18.5 12.8h2.1"></path><path d="M4.6 8.2h14.8"></path><path d="M12 5.2v2.6"></path></g>
          <g class="f" fill="none" stroke="#F3B7B2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M6 10h12l-1 8.4a2 2 0 0 1-2 1.7H9a2 2 0 0 1-2-1.7L6 10Z"></path><path d="M8.6 10V5.4M12 10V3.6M15.4 10v-4"></path></g>
          <g class="f" fill="none" stroke="#A9D6E6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M7.5 7.5h9l-1 11.4a2 2 0 0 1-2 1.8h-3a2 2 0 0 1-2-1.8L7.5 7.5Z"></path><path d="M8 12h8"></path><path d="M14.5 7.5 17 3.2"></path></g>
          <g class="f" fill="none" stroke="#DCBEDB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M8.2 11h7.6L12 20.6 8.2 11Z"></path><path d="M7 11a5 5 0 0 1 10 0"></path><path d="M9.6 7.4a3 3 0 0 1 4.8 0"></path></g>
        </svg>
      } @else {
        <svg
          class="loading-icon-svg"
          [attr.width]="size"
          [attr.height]="size"
          viewBox="0 0 80 80"
          role="img"
          [attr.aria-label]="label || 'กำลังโหลด'"
        >
          <rect x=".5" y=".5" width="79" height="79" rx="24" fill="#ffffff" stroke="#E7E2D8"></rect>
          <g class="f" fill="none" stroke="#5A6482" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M3.5 13.5h17a8.5 8.5 0 0 1-17 0Z"></path><path d="M2.5 17.8h19"></path><path d="M9 10.6c0-1.5 1.1-1.9 1.1-2.9s-1.1-1.3-1.1-2.4M14 10.6c0-1.5 1.1-1.9 1.1-2.9S14 6.4 14 5.3"></path></g>
          <g class="f" fill="none" stroke="#8A6D3F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M4 12.5h13a6.5 6.5 0 0 1-13 0Z"></path><path d="M4.5 15.5h12"></path><path d="M14.5 3.5 8.5 12M17.5 4.5 11 12"></path></g>
          <g class="f" fill="none" stroke="#3F6B54" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M5.5 10.5h13l-.9 6.6a2.2 2.2 0 0 1-2.2 1.9H8.6a2.2 2.2 0 0 1-2.2-1.9l-.9-6.6Z"></path><path d="M5.5 12.8H3.4M18.5 12.8h2.1"></path><path d="M4.6 8.2h14.8"></path><path d="M12 5.2v2.6"></path></g>
          <g class="f" fill="none" stroke="#8C5450" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M6 10h12l-1 8.4a2 2 0 0 1-2 1.7H9a2 2 0 0 1-2-1.7L6 10Z"></path><path d="M8.6 10V5.4M12 10V3.6M15.4 10v-4"></path></g>
          <g class="f" fill="none" stroke="#3E6A7C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M7.5 7.5h9l-1 11.4a2 2 0 0 1-2 1.8h-3a2 2 0 0 1-2-1.8L7.5 7.5Z"></path><path d="M8 12h8"></path><path d="M14.5 7.5 17 3.2"></path></g>
          <g class="f" fill="none" stroke="#755273" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(19 19) scale(1.75)"><path d="M8.2 11h7.6L12 20.6 8.2 11Z"></path><path d="M7 11a5 5 0 0 1 10 0"></path><path d="M9.6 7.4a3 3 0 0 1 4.8 0"></path></g>
        </svg>
      }
      @if (text) {
        <span class="loading-icon-text">{{ text }}</span>
      }
    </div>
  `,
  styleUrl: './loading-icon.component.scss'
})
export class LoadingIconComponent {
  @Input() variant: 'light' | 'dark' = 'light';
  @Input() size = 64;
  @Input() text = '';
  @Input() label = '';
  // true = แสดงแบบ inline เล็กๆ ต่อท้ายข้อความ (ไม่มี margin แนวตั้ง), false (ค่าเริ่มต้น) = แสดงกลางกล่อง/หน้า
  @Input() inline = false;
  // true = ลอยทับเต็มจอ ตรงกลางจริงๆ (position: fixed) แทนกลางแค่กล่องที่ประกาศไว้
  @Input() fullpage = false;
}
