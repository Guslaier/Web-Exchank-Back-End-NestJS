import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateExchangeRateDto {
  @IsString()
  @IsNotEmpty()
  currencyCode: string;

  @IsNumber()
  @IsNotEmpty()
  buyRate: number;

  @IsNumber()
  @IsNotEmpty()
  sellRate: number;
}
