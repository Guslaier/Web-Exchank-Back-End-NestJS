import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

async function bootstrap() {
  process.env.TZ = 'Asia/Bangkok';
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3000;

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.enableCors({
    origin: (origin: any, callback: any) => {
      callback(null, origin || '*');
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  });

  await app.listen(PORT);
  console.log(`Application is running on: https://localhost:${PORT}`);

  console.log('Current Server Time:', new Date().toString());
}

bootstrap();
