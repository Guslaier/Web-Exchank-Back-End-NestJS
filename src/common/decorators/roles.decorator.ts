import { SetMetadata } from '@nestjs/common';
import { UserData } from 'index';

export const ROLES_KEY = 'roles';
// สร้าง Decorator ที่รับค่าเป็น Array ของ string (เช่น 'admin', 'user')
export const Roles = (...roles: UserData['role'][]) =>
  SetMetadata(ROLES_KEY, roles);
