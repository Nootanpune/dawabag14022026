// src/controllers/productImage.controller.ts — admin upload/removal of a
// product's pack photo (multipart field "image"). The file is held in memory
// only (multer memoryStorage) and goes straight to the object store.
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PRODUCT_IMAGE_MAX_BYTES } from '../utils/imageCheck';
import { clearProductImage, setProductImage } from '../services/productImage.service';

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: 1 },
});

// PUT /products/:productId/image — new photo waits for pharmacist approval (C-19)
export async function putProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.productId);
    res.json({ success: true, message: 'Photo saved; customers see it once a pharmacist approves it', data: await setProductImage(id, req.file, req.user!.id) });
  } catch (err) { next(err); }
}

// DELETE /products/:productId/image
export async function deleteProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.productId);
    res.json({ success: true, message: 'Photo removed', data: await clearProductImage(id, req.user!.id) });
  } catch (err) { next(err); }
}
