# Web-Exchank Backend (API)

## ภาพรวมงาน

**Web-Exchank Backend API** เป็นระบบหลังบ้านสำหรับจัดการและบันทึกธุรกรรมการแลกเปลี่ยนเงินตราต่างประเทศ โดยออกแบบมาเพื่อรองรับการทำงานแบบเรียลไทม์ มีความถูกต้อง แม่นยำ และสามารถตรวจสอบย้อนหลังได้

จากปัญหาการทำงานแบบเดิมที่ใช้การจดบันทึกด้วยกระดาษ ทำให้เกิดความล่าช้าในการปิดยอดรายวัน และยากต่อการตรวจสอบข้อมูล ระบบนี้จึงถูกพัฒนาขึ้นเพื่อช่วยให้การจัดการธุรกรรม การคำนวณทางการเงิน และการตรวจสอบข้อมูลทำได้อย่างรวดเร็ว โปร่งใส และมีประสิทธิภาพมากยิ่งขึ้น

Backend ทำหน้าที่เป็นศูนย์กลางของระบบในการจัดการ **Business Logic**, ประมวลผลข้อมูล และให้บริการ API สำหรับเชื่อมต่อกับระบบฝั่ง Frontend

### พนักงาน (Employee)

* ดูรายการเคลื่อนไหวแบบเรียลไทม์
* ทำธุรกรรมแลกเปลี่ยนเงินตรา (คำนวณอัตรา / ตรวจสอบยอดคงเหลือ)
* บันทึกข้อมูลลูกค้าก่อนทำรายการ
* ยกเลิก/แก้ไขรายการเมื่อเกิดข้อผิดพลาด
* ปิดกะการทำงาน

### ผู้จัดการ (Manager)

* บันทึกการโอนเงินระหว่างจุดบริการ
* จัดการเงินทุนเข้า-ออก
* จัดการผู้ใช้งาน (เพิ่ม / แก้ไข / ระงับบัญชี)
* จัดการจุดให้บริการ (บูท)
* ตรวจสอบและจัดการธุรกรรม
* ตรวจสอบประวัติการใช้งาน (Log)
* ปรับอัตราแลกเปลี่ยน (Manual / Auto)
* สร้างรายงาน (รายวัน / รายบุคคล) และส่งออกเป็น PDF / Excel

## เทคโนโลยีที่ใช้

* **Framework:** NestJS (TypeScript)
* **Database:** PostgreSQL
* **ORM:** TypeORM
* **Authentication:** JWT + Passport
* **Security:** bcrypt
* **Cache / Queue:** Redis


## การเริ่มต้นใช้งาน

### สิ่งที่ต้องมี

* Node.js (แนะนำเวอร์ชัน 20+)
* npm i
* Docker (แนะนำ)

### เริ่มต้นระบบ

```bash
docker-compose up -d --build
```

### พอร์ตที่ใช้งาน

* Backend: `3002`
* Database (PostgreSQL): `5432`
* Redis: `6379`


### ดู Log

```bash
docker-compose logs -f
```

### หยุดระบบ

```bash
docker-compose down
```

### รีเซ็ตระบบ (ลบข้อมูลทั้งหมด)

```bash
docker-compose down -v

```
### openssl
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout server.key -out server.cert -config ./config.cnf -extensions v3_req


## รันแบบไม่ใช้ Docker

```bash
npm run start:dev
```

## การตั้งค่า Environment

สร้างไฟล์ `.env` จาก `.env.example` และกำหนดค่าดังนี้:

* Database connection
* JWT Secret
* Redis configuration
* Port ของระบบ


## การ Seed ข้อมูล

```bash
npm run seed
```

## บัญชีเริ่มต้น (สำหรับทดสอบ)
> ใช้สำหรับ Development

* **Admin**
  * Email: `admin@m.exchang.com`
  * Password: `Admin@123`

* **Secondary Admin**
  * Email: `secadmin@m.exchang.com`
  * Password: `SecAdmin@123`

---
