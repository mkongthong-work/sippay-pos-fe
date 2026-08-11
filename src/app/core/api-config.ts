// หา origin ของ backend ตามลำดับความสำคัญ:
//   1. window.__SIPPAY_API_ORIGIN__ (ตั้งจาก public/env.js) — ใช้เมื่อแยก repo frontend/backend เป็นคนละ
//      โดเมน/โปรเจกต์ Vercel เท่านั้น ปกติปล่อยว่างไว้
//   2. ตอน dev (ng serve พอร์ต 4200) frontend/backend รันคนละพอร์ต ต้องชี้ไปที่ backend ตรงๆ (ใช้ hostname
//      เดียวกับที่เปิดหน้าเว็บอยู่ แทนที่จะ hardcode 'localhost' เพื่อให้เปิดจากเครื่องอื่นในวง LAN เดียวกัน
//      ได้เลย เช่น iPad เปิด http://<IP เครื่อง Mac>:4200)
//   3. ตอน production ที่ frontend+backend อยู่โปรเจกต์/โดเมนเดียวกัน (nginx reverse proxy หรือ Vercel
//      monorepo เดียว) → ใช้ path สัมพัทธ์ตรงๆ ไม่ต้องรู้ host/port ของ backend เลย
declare global {
  interface Window {
    __SIPPAY_API_ORIGIN__?: string;
  }
}

const runtimeOrigin = typeof window !== 'undefined' ? window.__SIPPAY_API_ORIGIN__?.trim() : '';
const isDevServer = typeof window !== 'undefined' && window.location.port === '4200';
const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const devOrigin = `http://${host}:8090`;

const resolvedOrigin = runtimeOrigin ? runtimeOrigin.replace(/\/$/, '') : isDevServer ? devOrigin : '';

export const API_BASE_URL = resolvedOrigin ? `${resolvedOrigin}/api` : '/api';
// ใช้ต่อกับ path ไฟล์ที่ backend คืนมาตรงๆ (เช่น slip_image_path) ซึ่งไม่ได้อยู่ใต้ /api
export const SERVER_BASE_URL = resolvedOrigin || (typeof window !== 'undefined' ? window.location.origin : '');

// path รูปที่ backend คืนมา (image_path, slip_image_path) มี 2 แบบ:
//   - path สัมพัทธ์ เช่น "/uploads/menu-items/xxx.jpg" — backend เก็บไฟล์เองในเครื่อง ต้องเติม SERVER_BASE_URL
//     นำหน้าถึงจะเปิดรูปได้
//   - URL เต็มขึ้นต้นด้วย http(s) — ไฟล์อยู่บน Supabase Storage อยู่แล้ว ใช้ตรงๆ ได้เลย ห้ามเติมซ้ำ
// ใช้ฟังก์ชันนี้แทนการต่อ SERVER_BASE_URL ตรงๆ ทุกที่ที่แสดงรูป กันพังตอนสลับโหมดเก็บไฟล์
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SERVER_BASE_URL}${path}`;
}
