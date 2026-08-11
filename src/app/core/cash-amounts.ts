// คำนวณตัวเลือกจำนวนเงินที่ลูกค้าน่าจะจ่าย (ปุ่มลัด) จากยอดรวมของบิล — ใช้ทั้งหน้า POS
// (จ่ายเงินทันทีสำหรับออเดอร์ซื้อกลับ) และหน้าคิดเงิน (checkout)

export function suggestAmounts(total: number): number[] {
  const roundUpTo = (amount: number, step: number) => Math.ceil(amount / step) * step;
  const candidates = new Set<number>();

  candidates.add(Math.ceil(total)); // ยอดพอดี
  candidates.add(roundUpTo(total, 20));
  candidates.add(roundUpTo(total, 50));
  candidates.add(roundUpTo(total, 100));

  for (const banknote of [100, 500, 1000]) {
    if (banknote >= total) {
      candidates.add(banknote);
    }
  }

  return Array.from(candidates)
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b)
    .slice(0, 5);
}
