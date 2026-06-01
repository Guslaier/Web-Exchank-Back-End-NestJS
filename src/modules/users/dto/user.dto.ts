import { IsString, IsNotEmpty, IsEmail, IsBoolean } from 'class-validator';
import { UserData } from 'index';

export class CreateUserDto implements Omit<
  UserData,
  'isActive' | 'id' | 'createdAt' | 'updatedAt' | 'passwordHash'
> {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  passwordHash?: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  role: 'MANAGER' | 'EMPLOYEE' | 'ADMIN';
}
export class CreateUserResponseDto implements Omit<
  UserData,
  'passwordHash' | 'isActive' | 'createdAt' | 'updatedAt' | 'id'
> {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
  @IsString()
  @IsNotEmpty()
  role: 'MANAGER' | 'EMPLOYEE' | 'ADMIN';
}

export class UserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  passwordHash?: string;

  @IsString()
  @IsNotEmpty()
  role: 'MANAGER' | 'EMPLOYEE' | 'ADMIN';

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}

export class ChangePasswordDto implements Pick<UserData, 'id'> {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class UpdateUserDto implements Omit<
  UserData,
  'isActive' | 'id' | 'createdAt' | 'updatedAt' | 'passwordHash'
> {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  role: 'MANAGER' | 'EMPLOYEE' | 'ADMIN';
}
