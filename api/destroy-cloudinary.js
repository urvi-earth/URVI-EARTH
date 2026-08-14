/* =====================================================
   URVI – Vercel Serverless Function: Cloudinary Asset Deletion
   ===================================================== */
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'fxmm5ecw',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { public_id, resource_type = 'image' } = req.body || {};

    if (!public_id) {
      return res.status(400).json({ error: 'Missing public_id parameter.' });
    }

    if (!process.env.CLOUDINARY_API_SECRET) {
      // In development or unconfigured environment, log warning and return mock success
      console.warn('CLOUDINARY_API_SECRET environment variable is missing.');
      return res.status(200).json({
        success: true,
        message: 'Cloudinary API secret not configured on server. Deletion simulated.',
        public_id
      });
    }

    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: resource_type || 'image',
      invalidate: true
    });

    return res.status(200).json({
      success: result.result === 'ok' || result.result === 'not found',
      result: result.result,
      public_id
    });

  } catch (error) {
    console.error('Cloudinary destroy serverless error:', error);
    return res.status(500).json({
      error: 'Failed to destroy Cloudinary asset.',
      details: error.message
    });
  }
}
