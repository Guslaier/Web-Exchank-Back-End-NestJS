import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ShiftData } from './../../../types/index';

export class GetStockShiftQuery implements Pick<ShiftData, 'id'> {
  @IsUUID()
  @IsOptional()
  id: string;
}

export class UpdateStockByExchangeTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsIn(['BUY', 'SELL'])
  @IsNotEmpty()
  type: string;

  @IsUUID()
  @IsNotEmpty()
  foreignRateId: string;

  @IsNumber()
  @IsNotEmpty()
  foreignCurrencyAmount: number;

  @IsNumber()
  @IsNotEmpty()
  totalThaiBahtAmount: number;
}

export class UpdateStockByExchangeTransactionForCancel {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsIn(['BUY', 'SELL'])
  @IsNotEmpty()
  type: string;

  @IsUUID()
  @IsNotEmpty()
  shiftId: string;

  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string;

  @IsNumber()
  @IsNotEmpty()
  foreignCurrencyAmount: number;

  @IsNumber()
  @IsNotEmpty()
  totalthaiBahtAmount: number;
}

export class UpdateStockByTransferTransactionDto {
  @IsUUID()
  @IsOptional()
  sender: string | null;

  @IsUUID()
  @IsOptional()
  receiver: string | null;

  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string;

  @IsNumber()
  @IsNotEmpty()
  transferAmount: number;
}
export class UpdateStockByTransferTransactionForCancel {
  @IsUUID()
  @IsOptional()
  sender_shift: string | null;

  @IsUUID()
  @IsOptional()
  receiver_shift: string | null;

  @IsUUID()
  @IsNotEmpty()
  exchangeRateId: string;

  @IsNumber()
  @IsNotEmpty()
  transferAmount: number;
}
