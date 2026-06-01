import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { BoothData } from 'index';

export class CreateBoothDto implements Pick<BoothData, 'name' | 'location'> {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location: string;
}

export class UpdateBoothDto implements Partial<BoothData> {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BoothDto implements Omit<
  BoothData,
  'createdAt' | 'updatedAt' | 'deletedAt' | 'location'
> {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;

  @IsBoolean()
  @IsNotEmpty()
  isOpen: boolean;

  @IsString()
  @IsNotEmpty()
  currentShiftId: string;

  @IsString()
  @IsNotEmpty()
  createdAt: Date;

  @IsString()
  @IsNotEmpty()
  updatedAt: Date;
}
