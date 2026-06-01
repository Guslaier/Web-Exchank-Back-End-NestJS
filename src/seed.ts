import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity'; // ตรวจสอบ Path ให้ตรงกับไฟล์ของคุณ
import * as bcrypt from 'bcrypt';
import { UserDto } from './modules/users/dto/user.dto';

async function bootstrap() {
  // 1. สร้าง Application Context (เป็นการปลุก NestJS ขึ้นมาทำงานแบบไม่มี HTTP Server)
  const app = await NestFactory.createApplicationContext(AppModule);

  // 2. ขอเรียกใช้งาน Repository ของ User จาก TypeORM
  const userRepository = app.get(getRepositoryToken(User));

  console.log('🌱 Starting data import (Seeding)...');

  try {
    // 3. ตรวจสอบก่อนว่ามีข้อมูลในระบบหรือยัง
    const count = await userRepository.count();
    console.log(`🔍 Found ${count} users in the system`);
    if (count === 0) {
      // 4. สร้างข้อมูลเริ่มต้น
      const passwordHash = await bcrypt.hash(
        process.env.PASSWORD_ADMIN || 'Admin@123',
        10,
      );
      const defaultAdmin = userRepository.create({
        email: process.env.USER_ID_ADMIN || 'admin@m.exchang.com',
        username: 'Admin',
        role: <UserDto['role']>'ADMIN',
        phoneNumber: '0000000000',
        passwordHash: passwordHash,
      });

      const secAdminPasswordHash = await bcrypt.hash(
        process.env.PASSWORD_SECADMIN || 'SecAdmin@123',
        10,
      );
      const secAdmin = userRepository.create({
        email: process.env.USER_ID_SECADMIN || 'secadmin@m.exchang.com',
        username: 'SecAdmin',
        role: <UserDto['role']>'ADMIN',
        phoneNumber: '1111111111',
        passwordHash: secAdminPasswordHash,
      });

      await userRepository.save([defaultAdmin, secAdmin]);
      console.log('✅ Successfully created default admin data!');
    } else {
      console.log(
        '⚠️ Data already exists in the system. Skipping default data creation.',
      );
    }
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    // 5. ปิดการทำงาน (สำคัญมาก ไม่งั้น Script จะค้าง)
    await app.close();
  }
}

bootstrap();
