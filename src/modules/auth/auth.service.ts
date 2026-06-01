import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { DataSource } from 'typeorm';
import { UserRole } from 'index';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private dataSource: DataSource,
    @Inject(SystemLogsService)
    private readonly systemLogsService: SystemLogsService,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}

  // ตรวจสอบรหัสผ่าน
  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.usersService.findOneWithPassword(email);
      if (!user || !user.passwordHash) return null;

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (isMatch) {
        const { passwordHash, ...result } = user;
        return result;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  // ระบบ Login พร้อม Transaction Log
  async login(loginDto: LoginDto, ip: string = 'Unknown IP') {
    // 1. ตรวจสอบข้อมูลผู้ใช้
    const validatedUser = await this.validateUser(
      loginDto.email,
      loginDto.password,
    );

    // กรณี Login ล้มเหลว
    if (!validatedUser) {
      await this.systemLogsService.createLog(null, {
        userId: null,
        action: 'LOGIN_FAILED',
        details: `Invalid credentials for email: ${loginDto.email}`,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // ตรวจสอบสถานะบัญชี
    if (!validatedUser.isActive) {
      await this.systemLogsService.createLog(validatedUser, {
        userId: validatedUser.id,
        action: 'LOGIN_FAILED',
        details: `Account deactivated: ${validatedUser.email}`,
      });
      throw new UnauthorizedException('User account is deactivated');
    }

    // 2. ใช้ Transaction คลุมการสร้าง Token และ Log (เพื่อความชัวร์ว่า Log ต้องถูกบันทึก)
    return await this.dataSource.transaction(async (manager) => {
      const jti = crypto.randomUUID();
      const payload = {
        email: validatedUser.email,
        id: validatedUser.id,
        role: validatedUser.role as UserRole,
        jti,
      };

      const accessToken = this.jwtService.sign(payload);

      // บันทึก Log สำเร็จลง DB ผ่าน manager
      await this.systemLogsService.createLog(
        validatedUser,
        {
          userId: validatedUser.id,
          action: 'LOGIN_SUCCESS',
          details: `User logged in from IP: ${ip}`,
        },
        manager,
      );

      return {
        access_token: accessToken,
        user: validatedUser,
      };
    });
  }

  // ระบบ Logout พร้อม Blacklist และ Log
  async logout(token: string) {
    const decoded: any = this.jwtService.decode(token);

    if (!decoded || !decoded.jti) {
      throw new UnauthorizedException('Invalid token');
    }

    return await this.dataSource.transaction(async (manager) => {
      // 1. คำนวณเวลาที่เหลือเพื่อลง Redis Blacklist
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const remainingTime = decoded.exp - currentTimeInSeconds;

      if (remainingTime > 0) {
        await this.redisClient.set(
          `blacklist:${decoded.jti}`,
          'true',
          'EX',
          remainingTime,
        );
      }

      // 2. บันทึก Log การ Logout ลง DB
      await this.systemLogsService.createLog(
        { id: decoded.id },
        {
          userId: decoded.id,
          action: 'LOGOUT_SUCCESS',
          details: `Session terminated (JTI: ${decoded.jti})`,
        },
        manager,
      );

      return { message: 'Logged out successfully' };
    });
  }

  // เช็ค Blacklist จาก Redis
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redisClient.get(`blacklist:${jti}`);
    return result === 'true';
  }
}
