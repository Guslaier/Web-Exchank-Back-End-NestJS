export const TimestampTransformer = {
  to: (value: any) => value, // ตอนเซฟเข้า DB ไม่ทำอะไร
  from: (value: any) => {
    if (!value) return value;
    // 1. รับค่าจาก DB (ซึ่งมักจะมาเป็น Date object ที่ Node มองว่าเป็น UTC)
    const date = new Date(value);

    // 2. บวกเวลาเพิ่ม 7 ชั่วโมง (25200000 มิลลิวินาที)
    // เพื่อให้เวลาตรงกับไทย แม้จะโดนครอบด้วยมาตรฐาน UTC ก็ตาม
    const thaiTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

    // 3. ส่งกลับในรูปแบบ ISO String
    // ผลลัพธ์ที่ได้จะเป็น: 2026-04-28T15:43:36.285Z (ตัวเลขจะเป็นเวลาไทย)
    return thaiTime.toISOString(); // แปลงเป็น string ใน timezone Asia/Bangkok
  },
};
