// thai-date.ts — ฟอร์แมตวันที่/เวลาแบบไทย (พ.ศ.) สั้นๆ สำหรับพิมพ์ท้ายใบแจ้งหนี้/เอกสารต่างๆ
// เช่น "11/8/2569 11:27:55" (วัน/เดือนไม่เติม 0 นำหน้า, ปี พ.ศ., เวลาเติม 0 นำหน้าให้ครบ 2 หลัก)
export function formatThaiTimestamp(d: Date): string {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
}
