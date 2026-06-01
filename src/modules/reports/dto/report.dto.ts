import {
  IsNumber,
  IsNotEmpty,
  Min,
  IsObject,
  ValidateNested,
  IsUUID,
  IsBoolean,
  IsDate,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ShiftData, BoothData } from './../../../types/index';
import { CreateCashCountDto } from './../../cash-counts/dto/cash-count.dto';

export class GetPreviousShift implements Pick<BoothData, 'id'> {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

export class GetShifts {
  @IsIn(['OPEN', 'CLOSE', 'COMPLETED'])
  @IsNotEmpty()
  status: string;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  from: Date;

  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  to: Date;
}

export class PutShiftParam implements Pick<ShiftData, 'id'> {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

export class PutShiftBody implements Pick<
  ShiftData,
  'balanceCheck' | 'cashAdvance'
> {
  @IsNumber()
  @IsNotEmpty()
  balanceCheck: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  cashAdvance: number;

  @IsObject()
  @ValidateNested()
  @Type(() => CreateCashCountDto)
  cashCountData: CreateCashCountDto;
}
