import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  // Reflector เป็นเครื่องมือของ NestJS ไว้ใช้อ่าน Metadata ที่เราแปะไว้ด้วย Decorator
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. อ่าน Role ที่ต้องการจาก Decorator @Roles() ของ Endpoint นั้นๆ
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // ถ้า Endpoint นั้นไม่ได้แปะ @Roles() แปลว่าไม่ได้ล็อค Role (ใครผ่าน JWT มาก็เข้าได้)
    if (!requiredRoles) {
      return true;
    }

    // 2. ดึงข้อมูล User จาก Request
    // (ข้อมูลนี้มาจาก JwtStrategy ที่เรา return payload ออกมาและไปผูกติดไว้กับ req.user)
    const { user } = context.switchToHttp().getRequest();

    // 3. เช็คว่า user มี Role ตรงกับที่ Endpoint ต้องการหรือไม่
    const hasRole = requiredRoles.includes(user?.role);

    if (!hasRole) {
      // ถ้า Role ไม่ตรง ให้โยน 403 Forbidden (คุณไม่มีสิทธิ์)
      throw new ForbiddenException(
        'You do not have permission to access this endpoint',
      );
    }

    return true;
  }
}
