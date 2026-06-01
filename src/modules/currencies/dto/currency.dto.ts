import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Length,
} from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
export class UpdateCurrencyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  updateMode?: 'AUTO' | 'MANUAL';

  @IsBoolean()
  @IsOptional()
  hasInitialBotData?: boolean;

  @IsString()
  @IsOptional()
  symbol: string; // เช่น $

  @IsOptional()
  buyRate: number;

  @IsOptional()
  sellRate: number;
}

export enum UpdateMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export class CurrencyUpdateModeDto {
  id: string;
  mode: UpdateMode;
}
