import { Multer, diskStorage } from 'multer';
import { extname } from 'path';

export const customerStorage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'upload/customers');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname));
  },
});
