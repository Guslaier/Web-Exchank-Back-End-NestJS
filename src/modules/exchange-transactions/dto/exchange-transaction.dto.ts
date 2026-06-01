import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDate,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  ExchangeTransactionData,
  CustomerData,
  TranType,
  TranStatus,
  ShiftData,
} from './../../../types/index';

export class CreateExchangeTransactionDto
  implements
    Pick<
      ExchangeTransactionData,
      'exchangeRatesId' | 'type' | 'foreignAmount' | 'thaiBahtAmount' | 'note'
    >,
    Partial<CustomerData>
{
  @IsUUID()
  @IsNotEmpty()
  exchangeRatesId: string;

  @IsIn(['BUY', 'SELL'])
  @IsNotEmpty()
  type: TranType;

  @IsNumber()
  @IsNotEmpty()
  foreignAmount: number;

  @IsNumber()
  @IsNotEmpty()
  exchangeRate: number;

  @IsNumber()
  @IsNotEmpty()
  thaiBahtAmount: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsOptional()
  customer_img?: any;

  @IsString()
  @IsOptional()
  passportNo?: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  hotelName?: string;

  @IsString()
  @IsOptional()
  roomNumber?: string;
}

export class GetExchangeTransactionDto implements Pick<
  ExchangeTransactionData,
  'id'
> {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class GetExchangeTransactionsFromShiftsDto implements Pick<
  ShiftData,
  'id'
> {
  @IsUUID()
  @IsOptional()
  id: string;
}

export class LimitDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  limit: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offset: number;
}

export class SetStatusDto implements Pick<ExchangeTransactionData, 'id'> {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class SetStatusToPendingBodyDto implements Pick<
  ExchangeTransactionData,
  'voidReason'
> {
  @IsString()
  @IsNotEmpty()
  voidReason: string;
}

export class SetStatusToApproveBodyDto implements Pick<
  ExchangeTransactionData,
  'status'
> {
  @IsIn(['VOIDED', 'CANCELED'])
  @IsNotEmpty()
  status: TranStatus;
}
