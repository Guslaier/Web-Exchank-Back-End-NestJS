import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { Not, Repository, DataSource, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { isUUID } from 'class-validator';
import { Booth } from '../booths/entities/booth.entity';
import { handleError } from '../../common/error/error';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject(SystemLogsService)
    private readonly systemLogsService: SystemLogsService,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}

  // Helper สำหรับบันทึก Log รองรับ Transaction

  private async log(
    user: any,
    action: string,
    details: string,
    manager?: EntityManager,
  ) {
    await this.systemLogsService.createLog(
      user,
      {
        userId: user?.id || null,
        action,
        details,
      },
      manager,
    );
  }

  // +++++++++++++++++++++++++++ สร้างผู้ใช้ใหม่ (Transaction) ++++++++++++++++++++++++++++
  async create(createUserDto: Omit<CreateUserDto, 'passwordHash' | 'role'>) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);

        // เช็ค Email ซ้ำ
        const existingUser = await userRepo.findOne({
          where: { email: createUserDto.email },
        });
        if (existingUser) {
          await this.log(
            null,
            'CREATE_USER_FAILED',
            `Email already in use: ${createUserDto.email}`,
            manager,
          );
          throw new UnauthorizedException('Email already in use');
        }

        const rawPassword = crypto
          .randomBytes(6)
          .toString('base64')
          .slice(0, 8);
        const passwordHash = await bcrypt.hash(rawPassword, 10);

        const user = userRepo.create({
          ...createUserDto,
          passwordHash,
        });

        const savedUser = await userRepo.save(user);
        await this.log(
          null,
          'CREATE_USER_SUCCESS',
          `Created: ${savedUser.email}`,
          manager,
        );

        return {
          user: {
            id: savedUser.id,
            email: savedUser.email,
            username: savedUser.username,
            role: savedUser.role,
          },
          generatedPassword: rawPassword,
        };
      });
    } catch (error) {
      handleError(error, 'UsersService.create');
    }
  }

  // +++++++++++++++++++++++++++ อัปเดตข้อมูล (Transaction) ++++++++++++++++++++++++++++
  async update(currentUser: any, id: string, updateUserDto: UpdateUserDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);

        // 1. ตรวจสอบว่า ID เป็น UUID ไหม (ใช้ Helper ที่คุณเขียนไว้)
        if (!isUUID(id)) {
          await this.log(
            null,
            'UPDATE_USER_FAILED',
            `Invalid UUID format: ${id}`,
            manager,
          );
          throw new BadRequestException(`Invalid UUID format: ${id}`);
        }

        // 2. ตรวจสอบว่าผู้ใช้ที่จะแก้ไขมีอยู่จริงไหม
        const existingUser = await userRepo.findOne({ where: { id } });
        if (!existingUser) {
          await this.log(
            null,
            'UPDATE_USER_FAILED',
            `User not found: ${id}`,
            manager,
          );
          throw new NotFoundException('User not found');
        }

        if (currentUser.id === id && updateUserDto.role) {
          if (updateUserDto.role !== existingUser.role) {
            await this.log(
              currentUser,
              'UPDATE_USER_FAILED',
              `Cannot change own role: ${id}`,
              manager,
            );
            throw new ForbiddenException('Cannot change own role');
          }
        }
        // 2. ตรวจสอบสิทธิ์ (Business Logic)
        if (existingUser.role === 'ADMIN') {
          const countAdmins = await userRepo.count({
            where: { role: 'ADMIN' },
          });
          if (
            existingUser.id === currentUser.id &&
            updateUserDto.role &&
            updateUserDto.role !== 'ADMIN' &&
            countAdmins <= 1
          ) {
            await this.log(
              currentUser,
              'UPDATE_USER_FAILED',
              `Cannot demote the only admin: ${id}`,
              manager,
            );
            throw new ForbiddenException('Cannot demote the only admin');
          }
        }
        if (
          currentUser.role === 'MANAGER' &&
          existingUser.role !== 'EMPLOYEE'
        ) {
          await this.log(
            currentUser,
            'UPDATE_USER_FAILED',
            `Manager can only update employee: ${id}`,
            manager,
          );
          throw new ForbiddenException('Manager can only update employee');
        }
        // 3. ตรวจสอบ Email ซ้ำ (กรณีมีการเปลี่ยนเมล)
        if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
          const emailInUse = await userRepo.findOne({
            where: { email: updateUserDto.email, id: Not(id) },
          });
          if (emailInUse) {
            await this.log(
              currentUser,
              'UPDATE_USER_FAILED',
              `Email already in use by another user: ${updateUserDto.email}`,
              manager,
            );
            throw new BadRequestException(
              'Email already in use by another user',
            );
          }
        }

        // 4. อัปเดตข้อมูล
        await userRepo.update(id, updateUserDto);

        // 5. บันทึก Log
        await this.log(
          currentUser,
          'UPDATE_USER_SUCCESS',
          `Updated user ID: ${id}`,
          manager,
        );

        // 6. ดึงข้อมูลใหม่ส่งกลับไป
        return await userRepo.findOne({
          where: { id },
          select: [
            'id',
            'email',
            'username',
            'role',
            'phoneNumber',
            'isActive',
          ],
        });
      });
    } catch (error) {
      handleError(error, 'UsersService.update');
    }
  }

  // +++++++++++++++++++++++++++ ลบผู้ใช้ (Soft Delete + Transaction) ++++++++++++++++++++++++++++
  async remove(currentUser: any, id: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const boothRepo = manager.getRepository(Booth); // ดึงผ่าน manager

        // 1. เช็คว่าพนักงานยังคุมบูธอยู่ไหม
        const activeBooths = await boothRepo.find({
          where: { currentShiftId: id },
          withDeleted: true,
        });
        if (activeBooths.length > 0) {
          await this.log(
            currentUser,
            'DELETE_USER_FAILED',
            `Cannot delete user: active shift at booth ${activeBooths[0].name}`,
            manager,
          );
          throw new ForbiddenException(
            `Cannot delete user: active shift at booth ${activeBooths[0].name}`,
          );
        }

        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          await this.log(
            currentUser,
            'DELETE_USER_FAILED',
            `User not found: ${id}`,
            manager,
          );
          throw new NotFoundException('User not found');
        }
        if (currentUser.id === id) {
          await this.log(
            currentUser,
            'DELETE_USER_FAILED',
            `Cannot delete yourself: ${id}`,
            manager,
          );
          throw new ForbiddenException('Cannot delete yourself');
        }

        // 2. มิวเทชันอีเมล
        const mutatedEmail = `${user.email}_deleted_${Date.now()}`;
        await userRepo.update(id, { email: mutatedEmail });

        // 3. Soft Delete
        const res = await userRepo.softDelete(id);
        if (res.affected === 0) {
          await this.log(
            currentUser,
            'DELETE_USER_FAILED',
            `Delete failed for user ID: ${id}`,
            manager,
          );
          throw new BadRequestException('Delete failed');
        }

        await this.log(
          currentUser,
          'DELETE_USER_SUCCESS',
          `Soft deleted: ${user.email}`,
          manager,
        );
        return { message: `User removed successfully` };
      });
    } catch (error) {
      handleError(error, 'UsersService.remove');
    }
  }

  // +++++++++++++++++++++++++++ จัดการสถานะบัญชี (Transaction) ++++++++++++++++++++++++++++
  async deactivate(currentUser: any, id: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const boothRepo = manager.getRepository(Booth);

        // 1. เช็คว่าพนักงานยังคุมบูธอยู่ไหม
        const activeBooths = await boothRepo.find({
          where: { currentShiftId: id },
          withDeleted: true,
        });
        if (activeBooths.length > 0) {
          await this.log(
            currentUser,
            'DEACTIVATE_USER_FAILED',
            `Cannot deactivate user: still assigned to booth ${activeBooths[0].name}`,
            manager,
          );
          throw new ForbiddenException(
            `Cannot deactivate user: still assigned to booth ${activeBooths[0].name}`,
          );
        }

        const user = await userRepo.findOne({ where: { id } });
        if (!user) {
          await this.log(
            currentUser,
            'DEACTIVATE_USER_FAILED',
            `User not found: ${id}`,
            manager,
          );
          throw new NotFoundException('User not found');
        }
        if (user.role === 'ADMIN') {
          await this.log(
            currentUser,
            'DEACTIVATE_USER_FAILED',
            `Cannot deactivate admin: ${id}`,
            manager,
          );
          throw new ForbiddenException('Cannot deactivate admin');
        }

        // 2. อัปเดตสถานะ
        await userRepo.update(id, { isActive: false });

        await this.log(
          currentUser,
          'DEACTIVATE_USER_SUCCESS',
          `Deactivated: ${id}`,
          manager,
        );
        return { message: 'User deactivated successfully' };
      });
    } catch (error) {
      handleError(error, 'UsersService.deactivate');
    }
  }

  async reactivate(currentUser: any, id: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
          await this.log(
            currentUser,
            'REACTIVATE_USER_FAILED',
            `User not found: ${id}`,
            manager,
          );
          throw new NotFoundException('User not found');
        }

        await userRepo.update(id, { isActive: true });
        await this.log(
          currentUser,
          'REACTIVATE_USER_SUCCESS',
          `Reactivated: ${id}`,
          manager,
        );
        return { message: 'User reactivated successfully' };
      });
    } catch (error) {
      handleError(error, 'UsersService.reactivate');
    }
  }

  // +++++++++++++++++++++++++++ เปลี่ยนรหัสผ่าน (Transaction) ++++++++++++++++++++++++++++
  async changePassword(
    currentUser: any,
    newPassword: string,
    oldPassword: string,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const user = await userRepo.findOne({ where: { id: currentUser.id } });

        if (!user) throw new NotFoundException('User profile not found');

        const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isMatch) {
          await this.log(
            currentUser,
            'CHANGE_PASSWORD_FAILED',
            'Invalid old password',
            manager,
          );
          throw new ForbiddenException('Old password incorrect');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await userRepo.update(currentUser.id, { passwordHash });

        await this.log(
          currentUser,
          'CHANGE_PASSWORD_SUCCESS',
          `User ${user.email} changed password`,
          manager,
        );
        return { message: 'Password updated successfully' };
      });
    } catch (error) {
      handleError(error, 'UsersService.changePassword');
    }
  }

  // +++++++++++++++++++++++++++ ฟังก์ชันขอรีเซ็ตรหัสผ่าน (Request Reset) ++++++++++++++++++++++++++++
  async requestResetPassword(currentUser: any, email: string, id: string) {
    // 1. ตรวจสอบเบื้องต้น: ต้องส่งอย่างใดอย่างหนึ่งมา
    if (!email && !id) {
      throw new BadRequestException('Please provide either email or user ID');
    }

    // 2. สร้างเงื่อนไขการค้นหาแบบ Dynamic (OR Logic)
    const whereConditions: any[] = [];

    if (email) {
      whereConditions.push({ email: email });
    }

    if (id) {
      if (!isUUID(id))
        throw new BadRequestException(`Invalid UUID format: ${id}`);
      whereConditions.push({ id: id });
    }

    // 3. ค้นหาผู้ใช้ (ถ้าส่งมาทั้งคู่ จะกลายเป็น WHERE email = ... OR id = ...)
    const user = await this.userRepository.findOne({
      where: whereConditions,
    });

    if (!user) {
      // เพื่อความปลอดภัย: ไม่บอกว่ามี email นี้หรือไม่ในระบบ (ป้องกันการไล่เช็ค Email)
      return { message: 'If email exists, reset token sent' };
    }

    const token = crypto.randomBytes(16).toString('hex');

    // เก็บลง Redis (อายุ 15 นาที) - อันนี้ไม่ต้อง Transaction ก็ได้เพราะเป็น Redis
    await this.redisClient.set(`reset:${token}`, user.id, 'EX', 60 * 15);

    // บันทึก Log การขอ Reset
    await this.log(
      currentUser,
      'REQUEST_RESET_PASSWORD',
      `User ${user.email} requested a password reset`,
    );

    return { message: 'Reset token sent', token };
  }

  // +++++++++++++++++++++++++++ ฟังก์ชันรีเซ็ตรหัสผ่านใหม่ (Reset Password) ++++++++++++++++++++++++++++
  async resetPassword(email: string, token: string, newPassword: string) {
    // 1. ตรวจสอบ Token จาก Redis
    const userId = await this.redisClient.get(`reset:${token}`);

    if (!userId) {
      throw new ForbiddenException('Invalid or expired token');
    }

    // 2. ใช้ Transaction เพื่อเปลี่ยนรหัสผ่านและ Log พร้อมกัน
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const user = await userRepo.findOne({ where: { id: userId, email } });

        if (!user) {
          throw new ForbiddenException('Invalid email or token');
        }

        // แฮชรหัสผ่านใหม่
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // อัปเดตข้อมูล
        await userRepo.update(userId, { passwordHash });

        // ลบ Token ทิ้งทันทีหลังใช้เสร็จ
        await this.redisClient.del(`reset:${token}`);

        // บันทึก Log
        await this.log(
          null,
          'RESET_PASSWORD_SUCCESS',
          `Password reset successful for user: ${email}`,
          manager,
        );

        return { message: 'Password reset successful' };
      });
    } catch (error) {
      handleError(error, 'UsersService.resetPassword');
    }
  }

  // +++++++++++++++++++++++++++ ฟังก์ชันค้นหา (ไม่ต้อง Transaction) ++++++++++++++++++++++++++++
  async findAll() {
    const users = await this.userRepository.find({
      select: [
        'id',
        'email',
        'username',
        'role',
        'phoneNumber',
        'isActive',
        'createdAt',
      ],
    });
    return users;
  }

  async findOne(id: string) {
    if (!isUUID(id)) {
      throw new BadRequestException(`Invalid UUID format: ${id}`);
    }
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'username', 'role', 'phoneNumber', 'isActive'],
    });
    if (!user) throw new NotFoundException(`User ID ${id} not found`);
    return user;
  }

  async findOneWithPassword(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user)
      throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }
}
