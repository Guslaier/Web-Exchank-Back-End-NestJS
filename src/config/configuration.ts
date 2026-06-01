export default () => ({
  // กำหนดค่า nodeEnv โดยใช้ค่า NODE_ENV จาก environment variable หรือใช้ค่าเริ่มต้นเป็น 'development'
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // กำหนดพอร์ตที่แอปพลิเคชันจะรัน โดยใช้ค่า PORT จาก environment variable หรือใช้ค่าเริ่มต้นเป็น 3001
  port: parseInt(process.env.PORT ?? '3001', 10),

  // กำหนดค่าการเชื่อมต่อฐานข้อมูล โดยใช้ค่า DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME จาก environment variable หรือใช้ค่าเริ่มต้น
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    pass: process.env.DB_PASS ?? 'postgres',
    name: process.env.DB_NAME ?? 'web_exchank',
  },

  // กำหนดค่าการตั้งค่า JWT โดยใช้ค่า JWT_SECRET และ JWT_EXPIRES_IN จาก environment variable หรือใช้ค่าเริ่มต้น
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_this_secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },

  // กำหนดค่าการเชื่อมต่อ Redis โดยใช้ค่า REDIS_HOST และ REDIS_PORT จาก environment variable หรือใช้ค่าเริ่มต้น
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  // กำหนดค่า BOT API โดยใช้ค่า BOT_API_URL และ BOT_API_KEY จาก environment variable หรือใช้ค่าเริ่มต้น
  botApi: {
    url: process.env.BOT_API_URL ?? 'localhost',
    key: process.env.BOT_API_KEY ?? '',
  },
});
