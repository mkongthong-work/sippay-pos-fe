// promptpay.ts — ประกอบ payload สำหรับ QR พร้อมเพย์ (Thai QR Payment) ตามสเปก EMVCo QR Code Specification
// for Payment Systems (EMV QRCPS) โค้ดนี้เป็นการพอร์ตมาจาก reference implementation ที่ใช้กันแพร่หลาย
// (https://github.com/dtinth/promptpay-qr) เขียนใหม่เป็น TypeScript ล้วน ไม่พึ่ง npm package เสริม (เช่น
// 'crc') เพื่อลด dependency — ใช้แค่คำนวณ CRC16-CCITT (False) เองตรงๆ ตามสเปก
//
// อ้างอิงเดียวกับ frontend: ไม่ต้องต่อ payment gateway ใดๆ เพราะ QR แบบนี้แค่ฝัง "จะโอนเข้าใครเท่าไหร่"
// ให้แอปธนาคารของลูกค้าอ่านแล้วช่วยกรอกให้เอง ธนาคารไม่ได้ยืนยันสถานะจ่ายเงินกลับมาให้ระบบอัตโนมัติ (ต่างจาก
// การเชื่อม payment gateway จริงที่มี webhook แจ้งผลกลับ — เรื่องนี้ยังอยู่นอกขอบเขต Phase 1 ตาม
// backend/docs/ARCHITECTURE.md)

const ID_PAYLOAD_FORMAT = '00';
const ID_POI_METHOD = '01';
const ID_MERCHANT_INFORMATION_BOT = '29';
const ID_TRANSACTION_CURRENCY = '53';
const ID_TRANSACTION_AMOUNT = '54';
const ID_COUNTRY_CODE = '58';
const ID_CRC = '63';

const PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE = '01';
const POI_METHOD_STATIC = '11';
const POI_METHOD_DYNAMIC = '12';
const MERCHANT_INFORMATION_TEMPLATE_ID_GUID = '00';
const BOT_ID_MERCHANT_PHONE_NUMBER = '01';
const BOT_ID_MERCHANT_TAX_ID = '02';
const BOT_ID_MERCHANT_EWALLET_ID = '03';
const GUID_PROMPTPAY = 'A000000677010111';
const TRANSACTION_CURRENCY_THB = '764';
const COUNTRY_CODE_TH = 'TH';

// f() ห่อค่าแต่ละฟิลด์เป็น TLV (tag 2 หลัก + length 2 หลัก + value) ตามสเปก EMVCo
function f(id: string, value: string): string {
  return id + ('00' + value.length).slice(-2) + value;
}

function serialize(xs: (string | false | undefined)[]): string {
  return xs.filter((x): x is string => !!x).join('');
}

// เก็บเฉพาะตัวเลข ตัดขีด/วรรค/อักขระอื่นทิ้งทั้งหมด
function sanitizeTarget(id: string): string {
  return id.replace(/[^0-9]/g, '');
}

// แปลงเลขพร้อมเพย์ให้เป็นรูปแบบ 13 หลักตามสเปก: เลขบัตรประชาชน/เลขผู้เสียภาษี (>=13 หลัก) ใช้ตามที่กรอกได้เลย
// ส่วนเบอร์โทร (10 หลัก) ต้องแทนเลข 0 นำหน้าด้วยรหัสประเทศ 66 แล้วเติม 0 ข้างหน้าให้ครบ 13 หลัก
function formatTarget(id: string): string {
  const numbers = sanitizeTarget(id);
  if (numbers.length >= 13) return numbers;
  return ('0000000000000' + numbers.replace(/^0/, '66')).slice(-13);
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function formatCrc(crcValue: number): string {
  return ('0000' + crcValue.toString(16).toUpperCase()).slice(-4);
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, ไม่ reflect, ไม่ xor ปิดท้าย) — อัลกอริทึมมาตรฐานที่ EMVCo
// QR ใช้คำนวณเช็คซัมฟิลด์สุดท้าย (tag 63)
function crc16ccitt(str: string): number {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xff) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * generatePromptPayPayload สร้างสตริง payload สำหรับเข้ารหัสเป็น QR พร้อมเพย์
 * @param target เลขพร้อมเพย์ของร้าน (เบอร์โทร 10 หลัก, เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก, หรือ e-Wallet ID 15 หลัก)
 * @param amount จำนวนเงินที่ต้องการให้ QR ระบุตายตัว (ไม่ใส่ = QR แบบไม่ระบุจำนวนเงิน ให้ลูกค้ากรอกเอง)
 */
export function generatePromptPayPayload(target: string, amount?: number): string {
  const sanitized = sanitizeTarget(target);
  const targetType =
    sanitized.length >= 15
      ? BOT_ID_MERCHANT_EWALLET_ID
      : sanitized.length >= 13
        ? BOT_ID_MERCHANT_TAX_ID
        : BOT_ID_MERCHANT_PHONE_NUMBER;

  const data = [
    f(ID_PAYLOAD_FORMAT, PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE),
    f(ID_POI_METHOD, amount ? POI_METHOD_DYNAMIC : POI_METHOD_STATIC),
    f(
      ID_MERCHANT_INFORMATION_BOT,
      serialize([f(MERCHANT_INFORMATION_TEMPLATE_ID_GUID, GUID_PROMPTPAY), f(targetType, formatTarget(target))])
    ),
    f(ID_COUNTRY_CODE, COUNTRY_CODE_TH),
    f(ID_TRANSACTION_CURRENCY, TRANSACTION_CURRENCY_THB),
    amount ? f(ID_TRANSACTION_AMOUNT, formatAmount(amount)) : undefined
  ];

  const dataToCrc = serialize(data) + ID_CRC + '04';
  data.push(f(ID_CRC, formatCrc(crc16ccitt(dataToCrc))));
  return serialize(data);
}
