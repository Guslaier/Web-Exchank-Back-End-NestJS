import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  Validate,
  ValidateNested,
  IsOptional,
  Matches,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CashCountData } from './../../../types/index';

class DenominationDto implements Pick<CashCountData, 'denomination'> {
  @IsIn(['1000', '500', '100', '50', '20', '10', '5', '2', '1'])
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, {
    message: 'denomination must be an integer string (e.g., "1000", "500")',
  })
  denomination: string;
}

class AmountDto implements Pick<CashCountData, 'amount'> {
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  amount: number;
}

export class CreateCashCountDto implements Pick<
  CashCountData,
  'transactionId'
> {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsUUID()
  @IsOptional()
  currencyId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DenominationDto)
  denominations: DenominationDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AmountDto)
  amounts: AmountDto[];
}

export class GetCashCountDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;
}

export class CashCountItemDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, {
    message: 'denominations must be an integer string (e.g., "100", "500")',
  })
  denominations: string; // // ใช้ชื่อ denominations ตาม JSON ของคุณ

  @IsNumber()
  @Min(0)
  amounts: number; // // ใช้ชื่อ amounts ตาม JSON ของคุณ
}

export class CashCountItemArrayDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested()
  @Type(() => DenominationDto)
  denominations: DenominationDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested()
  @Type(() => AmountDto)
  amounts: AmountDto[];
}
