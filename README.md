# POS Frontend (Angular 18, standalone components)

## ติดตั้งและรัน

ต้องมี Node.js >= 18 ติดตั้งในเครื่อง

```bash
cd frontend
npm install
npm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:4200` (ต้องรัน backend ที่ `http://localhost:8080` ไว้ด้วย — ดู `../backend/README.md`)

ล็อกอินด้วยผู้ใช้เริ่มต้น: `admin` / `admin1234`

## โครงสร้างโค้ด

```
src/app/
  core/                       services + guard + interceptor
    models.ts                 TypeScript interface ตรงกับ JSON ของ backend
    api-config.ts             URL ของ backend (แก้ตรงนี้ถ้า deploy จริง)
    auth.service.ts           login/logout, เก็บ token ใน localStorage
    auth.guard.ts             กันไม่ให้เข้าหน้าในระบบถ้ายังไม่ล็อกอิน
    auth.interceptor.ts       แนบ JWT token ไปกับทุก request
    menu.service.ts           เรียก API หมวดหมู่/เมนู
    table.service.ts          เรียก API โต๊ะ
    order.service.ts          เรียก API ออเดอร์/ปิดบิล
    report.service.ts         เรียก API รายงานยอดขาย

  layout/shell/                นำทาง (nav bar) ครอบทุกหน้าหลังล็อกอิน

  pages/
    login/                     หน้าล็อกอิน
    pos/                       หน้าขาย — เลือกเมนู ใส่ตะกร้า เลือกโต๊ะ/ซื้อกลับ ส่งออเดอร์
    orders/                    ออเดอร์ที่ยังไม่ปิด — เปลี่ยนสถานะ, ปิดบิล (เงินสด)
    menu-admin/                จัดการหมวดหมู่/เมนู
    reports/                   รายงานยอดขายรายวัน
```

ทุกหน้าเป็น standalone component เชื่อม backend ผ่าน `HttpClient` (REST + JSON) ไม่ได้ใช้ UI library สำเร็จรูป — สไตล์อยู่ใน `styles.scss` (ตัวแปรสี) และไฟล์ `.scss` ของแต่ละ component ปรับแก้ได้อิสระ

## หมายเหตุ

- ยังไม่ได้ต่อเครื่องพิมพ์ใบเสร็จ/ลิ้นชักเงิน/เครื่องรูดบัตร ตามที่ตกลงไว้ — ปิดบิลตอนนี้เป็นการบันทึกยอดรับเงินสดในระบบเท่านั้น
- หน้าจอออกแบบให้ปุ่มใหญ่ เหมาะกดบนแท็บเล็ตแบบสัมผัส
- ถ้าจะ build ไปใช้งานจริง: `npm run build` แล้วนำไฟล์ในโฟลเดอร์ `dist/` ไปวางบน web server ใดก็ได้ (อย่าลืมแก้ `api-config.ts` ให้ชี้ไปที่ backend จริง)
