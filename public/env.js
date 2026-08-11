// ตั้งค่านี้เฉพาะตอนแยก repo frontend/backend เป็นคนละโปรเจกต์ Vercel (คนละโดเมน) เท่านั้น
// ใส่โดเมนของโปรเจกต์ backend (repo api) หลัง deploy เสร็จแล้ว เช่น "https://sippay-api.vercel.app"
// (ไม่ต้องมี /api ต่อท้าย ระบบเติมให้เอง)
//
// ถ้า frontend+backend อยู่ใน Vercel โปรเจกต์เดียวกัน (deploy ตาม vercel.json ที่ root ของ pos-project
// เดิม) ปล่อยเป็นค่าว่าง "" ไว้แบบนี้ได้เลย ระบบจะใช้ path สัมพัทธ์ /api อัตโนมัติ ไม่ต้องแก้ไฟล์นี้
//
// แก้ไฟล์นี้ได้โดยไม่ต้อง build frontend ใหม่ — เป็น static asset เพียวๆ ไป rebuild ทุกครั้งที่ backend
// ย้ายโดเมนก็ได้ หรือแก้ตรงในแดชบอร์ด Vercel (Settings > ไฟล์ในนี้จะถูกเสิร์ฟที่ /env.js)
window.__SIPPAY_API_ORIGIN__ = "https://sippay-pos-be.vercel.app";
