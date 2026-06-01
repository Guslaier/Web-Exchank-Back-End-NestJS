import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

const logger = new Logger('ErrorHandler');

/**
 * ฟังก์ชันจัดการ Error กลางสำหรับระบบ
 * @param error - object error ที่รับมาจาก catch block
 * @param context - ข้อความระบุบริบท เช่น 'TransferService.create'
 */
export function handleError(error: any, context: string = 'System'): never {
  // 1. บันทึก Log ลง Server Console พร้อม Stack Trace เพื่อใช้ไล่ Code
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(
    `[${context}] Error: ${errorMessage}`,
    error instanceof Error ? error.stack : undefined,
  );

  // 2. ถ้าเป็น HttpException (พวก BadRequest, NotFound ที่เราตั้งใจ throw)
  // ให้ส่งต่อออกไปตามเดิม เพื่อให้ Client ได้รับ Status Code ที่ถูกต้อง
  if (error instanceof HttpException) {
    throw error;
  }

  // 3. กรณี Error จาก Database (เช่น Unique Constraint, Not Null)
  // เราอาจจะดึงข้อความเฉพาะเจาะจงออกมาได้ (แต่ควรระวังเรื่องการเปิดเผยโครงสร้าง DB)
  if (error.code === '23505') {
    // ตัวอย่างรหัสของ Postgres Unique Violation
    // throw new BadRequestException('ข้อมูลนี้มีอยู่ในระบบแล้ว');
  }

  // 4. กรณี Error อื่นๆ ที่ไม่คาดคิด
  // ปลอดภัยกว่าด้วยการส่ง Internal Server Error พร้อมระบุบริบทสั้นๆ
  throw new InternalServerErrorException({
    message: `An unexpected error occurred during ${context}`,
    detail: process.env.NODE_ENV === 'development' ? errorMessage : undefined, // แสดงรายละเอียดเฉพาะตอน Dev
  });
}
