import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// สร้าง JwtAuthGuard โดยสืบทอดจาก AuthGuard ของ Passport และระบุว่าเราจะใช้กลยุทธ์ 'jwt'
export class JwtAuthGuard extends AuthGuard('jwt') {}
