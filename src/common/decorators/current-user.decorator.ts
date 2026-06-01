import { createParamDecorator, ExecutionContext } from '@nestjs/common';
// สร้าง custom decorator ชื่อ CurrentUser โดยใช้ createParamDecorator จาก NestJS
// CurrentUser จะถูกใช้ใน controller เพื่อดึงข้อมูลผู้ใช้ที่ถูกตรวจสอบแล้วจาก request object
// ตัวอย่างการใช้งานใน controller:
// @Get('profile')
// getProfile(@CurrentUser() user: User) {
//   return user;
// }

// ใช้สำหรับดึงข้อมูลผู้ใช้ที่ถูกตรวจสอบแล้วจาก request object
export const CurrentUser = createParamDecorator(
  // ตัวแปร _ ถูกใช้เพื่อบอกว่าเราจะไม่ใช้พารามิเตอร์แรก (data) ในฟังก์ชันนี้
  (_: unknown, ctx: ExecutionContext) => {
    // ดึง request object จาก context และคืนค่าข้อมูลผู้ใช้ที่ถูกตรวจสอบแล้ว
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
