import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsDecimal,
  IsNumberString,
  Matches,
  IsInt,
  ArrayNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  TransferTransactionData,
  TranSectionType,
  TranStatus,
  TransferTransactionType,
  CashCountData,
} from './../../../types';
import { CashCountItemDto } from '../../cash-counts/dto/cash-count.dto';
import { isOperatorNode } from 'mathjs';

export class CreateTransferTransactionDto implements Omit<
  TransferTransactionData,
  'refBoothId' | 'createdAt' | 'updatedAt' | 'id'
> {
  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string; // ID ของอัตราแลกเปลี่ยน

  @IsString()
  @IsNotEmpty()
  exchangeRateName: string; // ชื่อของอัตราแลกเปลี่ยน

  @IsUUID()
  @IsOptional()
  boothId: string; // FK

  @IsUUID()
  @IsOptional()
  ShiftId?: string | null;

  @IsNumber()
  @IsNotEmpty()
  amount: number; // จำนวนเงิน

  @IsString()
  @IsNotEmpty()
  type: TransferTransactionType; // ประเภทการโอน

  @IsUUID()
  @IsOptional()
  refBoothId?: string; // ID บูธที่อ้างอิง

  @IsUUID()
  @IsOptional()
  refShiftId?: string | null | undefined;

  @IsString()
  @IsOptional()
  description?: string; // รายละเอียด (ใส่ ? เพราะปกติมักจะเป็น optional)

  @IsOptional()
  @IsString()
  internalTransactionId: string | null; // เพิ่มฟิลด์สำหรับเก็บ internalTransactionId

  @IsUUID()
  @IsNotEmpty()
  userId: string; // ผู้ทำรายการ

  @IsString()
  status: TranStatus; // สถานะ (เช่น success, pending, cancel)

  @IsUUID()
  @IsOptional()
  shiftId?: string | null; // อนุญาตให้เป็น null ได้สำหรับบางประเภทของ transaction เช่น transfer ระหว่างบูธ
}

export class TransferBoothToBoothDto implements Omit<
  TransferTransactionData,
  'userId' | 'status' | 'type' | 'createdAt' | 'updatedAt' | 'id'
> {
  @IsUUID()
  @IsNotEmpty()
  boothId: string;

  @IsUUID()
  @IsNotEmpty()
  refBoothId: string;

  @IsNumber()
  @IsNotEmpty()
  @IsInt()
  amount: number;

  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string;

  @IsString()
  @IsOptional()
  type?: TransferTransactionType; // กำหนดเป็น optional และใช้ TransferTransactionType แทน TranSectionType เพราะเราต้องการระบุประเภทการโอนที่ชัดเจน เช่น 'TRANSFER_IN' หรือ 'TRANSFER_OUT'

  @IsString()
  @IsOptional()
  description?: string;
}

export class TransferCenterToBoothDto implements Omit<
  TransferTransactionData,
  'userId' | 'refBoothId' | 'type' | 'createdAt' | 'updatedAt' | 'id'
> {
  @IsUUID()
  @IsNotEmpty()
  boothId: string;

  @IsNumber()
  @IsNotEmpty()
  @IsInt()
  amount: number;

  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string;

  @IsString()
  type: TransferTransactionType; // กำหนดเป็น optional และใช้ TransferTransactionType แทน TranSectionType เพราะเราต้องการระบุประเภทการโอนที่ชัดเจน เช่น 'TRANSFER_IN' หรือ 'TRANSFER_OUT'

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status: TranStatus;
}

export class TranferCashcountDto implements Omit<
  TransferTransactionData,
  | 'userId'
  | 'refBoothId'
  | 'type'
  | 'createdAt'
  | 'updatedAt'
  | 'id'
  | 'exchangeRateId'
> {
  @IsUUID()
  @IsNotEmpty()
  boothId: string;

  @IsNumber()
  @IsNotEmpty()
  @IsInt()
  amount: number;

  @IsString()
  @IsOptional()
  type: TransferTransactionType; // กำหนดเป็น optional และใช้ TransferTransactionType แทน TranSectionType เพราะเราต้องการระบุประเภทการโอนที่ชัดเจน เช่น 'TRANSFER_IN' หรือ 'TRANSFER_OUT'

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status: TranStatus;
}

export class UpdateTransferTransactionDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class GetTransfersByBoothDto implements Pick<
  TransferTransactionData,
  'boothId'
> {
  @IsUUID()
  @IsNotEmpty()
  boothId: string;
}

export class GetCashInventoryDto {
  @IsUUID()
  @IsNotEmpty()
  booth_id: string;
}

export class GetTotalReceiveDto {
  @IsString()
  @IsNotEmpty()
  shift_id: string;
}

// // 3. DTO หลักสำหรับรับ Request
export class FirstShiftCashCountDto {
  @ValidateNested()
  @Type(() => TranferCashcountDto)
  transferDto: TranferCashcountDto;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CashCountItemDto)
  cashCountDto: CashCountItemDto[];
}
