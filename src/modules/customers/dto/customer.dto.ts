import { IsString, IsNotEmpty } from 'class-validator';
import { CustomerData } from './../../../types/index';
import { im } from 'mathjs';

export class CreateCustomerDto implements Pick<
  CustomerData,
  'passportNumber' | 'firstName' | 'lastName'
> {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  passportNumber: string;
}

export class GetImgDto implements Pick<CustomerData, 'passportImg'> {
  @IsString()
  @IsNotEmpty()
  passportImg: string;
}
