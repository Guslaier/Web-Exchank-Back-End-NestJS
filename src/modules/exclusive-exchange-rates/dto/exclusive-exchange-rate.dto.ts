import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ExclusiveExchangeRate } from 'index';
import { im } from 'mathjs';

export class CreateExclusiveExchangeRateDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  currencyCode: string;

  @IsNumber()
  @IsNotEmpty()
  specialRate: number;
}
export class ConfirmReviewDto {
  ids: string[]; // รับเป็น Array ของ string ไปเลย ง่ายกว่า
}

export class UpdateExclusiveExchangeRateDto implements Partial<ExclusiveExchangeRate> {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsOptional()
  formula_buy?: string;

  @IsString()
  @IsOptional()
  formula_buy_max: string;
}
