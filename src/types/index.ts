export type UserRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; // อิงตาม Database
export type TranStatus =
  | 'COMPLETED'
  | 'COMPLETE_CONFIC'
  | 'PENDING'
  | 'VOIDED'
  | 'CANCELED'; // อิงตาม Database
export type TranSectionType =
  | 'EXCHANGE'
  | 'TRANSFER'
  | 'FIRST_SHIFT_CASH_COUNT'
  | 'CLOSE_SHIFT_CASH_COUNT'; // อิงตาม Database
export type TransferTransactionType =
  | 'CASH_IN'
  | 'CASH_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'; // สำหรับการโอนเงินระหว่างสาขา
export type TranType = 'BUY' | 'SELL'; // อิงตาม Database

//== User Interfaces ==//
export interface UserData {
  readonly id: string;
  username: string;
  passwordHash: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

//== Booth Interfaces ==//
export interface BoothData {
  readonly id: string;
  name: string;
  location: string;
  isActive: boolean;
  isOpen: boolean;
  currentShiftId: string | null; // ใช้สำหรับเช็คว่าบูธนี้มีการเปิดกะอยู่หรือไม่
  createdAt: Date;
  updatedAt: Date;
}

//== Transaction Shift Interfaces ==//
export interface ShiftData {
  readonly id: string; // id (PK)
  userId: string; // user_id (FK)
  boothId: string; // booth_id (FK)
  dateShift: Date; // date_shift
  startTime: Date; // shift_start
  endTime: Date; // shift_end
  totalReceive: number; // total_receive
  totalExchange: number; // total_exchange
  balance: number; // balance
  balanceCheck: number; // balance_check
  cashAdvance: number; // cash_advance
  createdAt: Date; // created_at
  updatedAt: Date; // updated_at
}

export class ShiftDetail {
  shiftid: string | null = null;
  userid: string | null = null;
  name: string = '';
  username: string | null = null;
  location: string | null = '';
  isActive: boolean = true;
  status: string | null = '';
  cashcount: CashCountInput[] = [];
  tranfer: Tranfersum[] = [];
  exchange: ExchangeSum[] = [];
  balance_check: number | null = null;
  cash_advance: number | null = null;

  constructor(
    name: string,
    location: string | null,
    active: boolean,
    userid: string | null,
    username: string | null,
  ) {
    this.name = name;
    this.location = location;
    this.isActive = active;
    this.userid = userid;
    this.username = username;
  }

  setShiftData(
    id: string,
    status: string,
    cash_advance: number | null,
    balance_check: number | null,
  ) {
    this.shiftid = id;
    this.status = status;
    this.cash_advance = cash_advance;
    this.balance_check = balance_check;
  }

  setCashcount(cc: CashCountInput[]) {
    this.cashcount = cc;
  }

  setTrafer(tranfer: Tranfersum[]) {
    this.tranfer = tranfer;
  }

  setExchange(exchange: ExchangeSum[]) {
    this.exchange = exchange;
  }
}

//== Customer Interfaces ==//
export interface CustomerData {
  readonly id: string; // PK จากในรูป
  passportImg: string; // passport image url
  passportNumber: string; // passport no
  firstName: string; // firstname
  lastName: string; // lastname
  nationality: string; // nationality
  phoneNumber: string; // phone number
  hotelName: string; // แก้จาก hotelNumber เป็น hotelName ให้ตรงตามรูป
  roomNumber: string; // room number
  createdAt: Date; // เพิ่มฟิลด์สุดท้ายที่อยู่ในรูปครับ
  updatedAt: Date; // เพิ่มฟิลด์สุดท้ายที่อยู่ในรูปครับ
}

//== Transaction Interfaces ==//
export interface TransactionData {
  readonly id: string;
  shiftId: string | null; // shiftId อาจเป็น null ได้สำหรับบางประเภทของ transaction เช่น transfer ระหว่างบูธ
  type: TranSectionType;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferTransactionData {
  readonly id: string; // PK, FK (Primary Key & Foreign Key)
  readonly exchangeRateId: string; // FK
  boothId: string; // FK
  ShiftId?: string | null; // shiftId อาจเป็น null ได้สำหรับบางประเภทของ transaction เช่น transfer ระหว่างบูธ
  amount: number; // จำนวนเงิน
  type: TransferTransactionType; // ประเภทการโอน
  refBoothId: string; // ID บูธที่อ้างอิง
  refShiftId?: string | null; // shiftId อาจเป็น null ได้สำหรับบางประเภทของ transaction เช่น transfer ระหว่างบูธ
  description?: string; // รายละเอียด (ใส่ ? เพราะปกติมักจะเป็น optional)
  userId: string; // ผู้ทำรายการ
  status: TranStatus; // สถานะ (เช่น success, pending, cancel)
  createdAt: Date;
  updatedAt: Date;
}

export type Tranfersum = Pick<
  TransferTransactionData,
  'amount' | 'type' | 'status'
>;

export interface ExchangeTransactionData {
  readonly id: string; // PK, FK
  readonly customerId: string; // customer_id
  readonly exchangeRatesId: string; // FK (อ้างอิงไปยังตารางเรท)
  type: TranType; // type (แนะนำให้ใช้ union type ถ้ามีแค่ซื้อ/ขาย)
  exchangeRate: number; // exchange rate
  foreignAmount: number; // foreign amount (จำนวนเงินต่างประเทศ)
  calculateMethod: string; // calculate method
  thaiBahtAmount: number; // thai baht amount (จำนวนเงินไทย)
  status: TranStatus; // status
  voidReason?: string; // void reason (optional)
  voidBy?: string; // void by (optional)
  approvedBy: string; // approved by
  note?: string; // note
  updatedAt: Date;
  createdAt: Date;
}

export interface ExchangeSum {
  type: string;
  exchangeRate: number;
  foreignCurrencyAmount: number;
  status: string;
}

export interface CashCountData {
  readonly id: string; // PK
  readonly currencyId: string; // FK (เช่น 'USD', 'THB')
  readonly transactionId: string; // FK (เชื่อมกับ exchange_transactions)
  denomination: string; // มูลค่าหน้าบัตร (เช่น 100, 500, 1000)
  amount: number; // จำนวนฉบับ หรือ ผลรวมมูลค่า
  createdAt: Date;
  updatedAt: Date;
}

export type CashCountInput = Pick<CashCountData, 'denomination' | 'amount'>;

//== Currency Interfaces ==//
export interface CurrencyIF {
  readonly code: string; // PK (เช่น 'USD', 'EUR', 'JPY')
  readonly name: string; // ชื่อเต็ม (เช่น 'United States Dollar')
  symbol: string; // สัญลักษณ์ (เช่น '$', '€', '¥')
  buyRate: number; // อัตราที่ร้านรับซื้อ
  sellRate: number; // อัตราที่ร้านขายออก
  updateMode: 'AUTO' | 'MANUAL'; // โหมดการอัปเดต
  hasInitialBotData: boolean; // บ่งบอกว่าเคยได้รับข้อมูลจาก BOT หรือไม่
  isActive: boolean; // สถานะการใช้งาน (true/false)
}

export interface ExchangeRate {
  readonly id: string; // PK
  readonly currencyCode: string; // FK (เช่น 'USD', 'JPY')
  name: string; // ชื่อเรียก (เช่น 'USD 50-100', 'USD 5-20')
  rangeStart: number; // ช่วงเริ่มต้นของมูลค่าธนบัตร
  rangeStop: number; // ช่วงสิ้นสุดของมูลค่าธนบัตร
  formalBuy: string; // ราคาที่ร้านรับซื้อ
  formalSell: string; // ราคาที่ร้านขายออก
  createdAt: Date;
  updatedAt: Date;
}

export interface ExclusiveExchangeRate {
  readonly exchangeRateId: string; // PK, FK (เชื่อมกลับไปยัง exchange_rates)
  id: string;

  exchange_rate_id: string;

  formula_buy: string;

  formula_buy_max: string;

  buy_rate: number;

  buy_rate_max: number;

  booth_id: string;

  sync_status: 'NORMAL' | 'SYSTEM_ADJUSTED';

  reviewed_by: string;

  reviewed_at: Date;

  is_reviewed: boolean;

  system_remark: string;

  updated_at: Date;

  deleted_at: Date;
}

//== Report Interfaces ==//
export interface ShiftStocksReport {
  readonly shiftId: string; // PK, FK (เชื่อมกับตาราง shifts)
  readonly currencyCode: string; // PK, FK (เช่น 'USD', 'EUR')
  totalBuy: number; // ยอดรวมการซื้อเข้า
  totalSell: number; // ยอดรวมการขายออก
  totalPending: number; // ยอดที่รอการยืนยัน
  totalTransferIn: number; // ยอดรวมการโอนเข้า (total tranfer in)
  totalTransferOut: number; // ยอดรวมการโอนออก (total tranfer out)
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftThaiCashflowReport {
  readonly shiftId: string; // PK, FK (เชื่อมกับตาราง shifts)
  readonly denomination: number; // PK (มูลค่าธนบัตร เช่น 20, 50, 100, 500, 1000)
  quantity: number; // จำนวนใบ (ในรูปสะกดว่า quanity)
  createdAt: Date;
  updatedAt: Date;
}

//== System Log Interface ==//
export interface SystemLog {
  readonly id: string; // PK
  readonly userId: string; // FK (เชื่อมกับตาราง users เพื่อดูว่าใครเป็นคนทำ)
  action: string; // การกระทำ (เช่น 'LOGIN', 'CREATE_TRANSACTION', 'UPDATE_RATE')
  description: string; // รายละเอียดของกิจกรรมนั้นๆ
  createdAt: Date; // วันเวลาที่เกิดเหตุการณ์
  updatedAt: Date;
}

export interface StockData {
  readonly id: string;
  readonly shiftId: string;
  exchangeRateId: string;
  total_received: number;
  total_exchanged: number;
  total_balance: number;
  createdAt: Date;
  updatedAt: Date;
}
