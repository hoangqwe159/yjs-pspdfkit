import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { randomUUID } from 'crypto';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Set up multer for file uploads

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
})

const upload = multer({ storage: storage })

// In-memory storage for binary data
let binaryData = null;

// Endpoint to upload a PDF file
app.post('/upload-pdf', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Move the file to a permanent location
  const tempPath = req.file.path;
  const targetPath = path.join(__dirname, 'uploads', 'document.pdf');

  fs.rename(tempPath, targetPath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save file' });
    }
    res.status(200).json({ message: 'PDF file uploaded successfully' });
  });
});

// Endpoint to upload binary data
app.post('/upload-binary', express.raw({ type: 'application/octet-stream', limit: '10mb' }), (req, res) => {
  binaryData = req.body;
  console.log('Binary data uploaded:', binaryData.length, 'bytes');
  res.status(200).json({ message: 'Binary data uploaded successfully' });
});

// Endpoint to upload image file and return id as image name
app.post('/upload-image', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Generate a unique ID for the image
  const imageId = randomUUID();
  const ext = path.extname(req.file.originalname);
  const targetPath = path.join(__dirname, 'uploads', `${imageId}${ext}`);

  // Move the file to a permanent location with the unique ID as the name
  fs.rename(req.file.path, targetPath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save image file' });
    }
    res.status(200).json({ message: 'Image file uploaded successfully', id: imageId });
  });
});

// Endpoint to retrieve an image file by ID
app.get('/get-image/:id', (req, res) => {
  const imageId = req.params.id;
  const uploadsDir = path.join(__dirname, 'uploads');

  // Search for the file with the given ID and any extension
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read uploads directory' });
    }

    const imageFile = files.find(file => file.startsWith(imageId));
    if (imageFile) {
      const imagePath = path.join(uploadsDir, imageFile);
      res.sendFile(imagePath);
    } else {
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

// Endpoint to retrieve the PDF file
app.get('/get-pdf', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', 'document.pdf');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'PDF file not found' });
  }
});

// Endpoint to retrieve the binary data
app.get('/get-binary', (req, res) => {
  if (binaryData) {
    res.type('application/octet-stream').send(binaryData);
  } else {
    res.status(404).json({ error: 'Binary data not found' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});