const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const genAI = new GoogleGenerativeAI("AIzaSyBcVJ7tcZ2SZkXuA5c5FvSKlZ5n1X1gBE8");

async function getGeminiResponse(prompt) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.fields([{ name: 'notes', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  const prompt = req.body.prompt || 'English';
  const notesPath = req.files['notes'] ? req.files['notes'][0].path : null;
  const imagePath = req.files['image'] ? req.files['image'][0].path : null;

  try {
    let pdfText = '';
    let imageText = '';

    if (notesPath) {
      const dataBuffer = fs.readFileSync(notesPath);
      const pdfData = await pdfParse(dataBuffer);
      pdfText = pdfData.text;
    }

    if (imagePath) {
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
      imageText = text;
    }

    const inputPrompt = `
      You are an experienced and well-developed notes simplifier which makes notes designer and makes them easy to learn with all dates and event highlights with all easy-looking and best keywords. Please make the notes below more engaging for students with special needs. Format the notes in a structured manner and remove all special characters like '**' from the output text, using '--' instead.
      Don't give any information about the prompt that I have given; just give the information in the most memorable manner.
      AND ADD "-" TO EVERY SUBTOPIC AND remember EVERY INPORTANT TERM  AND FERTHER AFTER COMPLETING EVERYTHING GIVE THAT WORDS A SEPARATE WHICH GIVE IT MEANING AND CONTEXT AND AFTER THAT GIVE THE IMPORTANT DATES WITH TIME LINE AND EVENTS IN SEQUENCE AND SIMPLE MANNER IF ANY. AND KEYWORD AND TIMELINE HEADING Should be there and dont use #
      Notes: ${pdfText} ${imageText}
      Give all in ${prompt} language
      AND ALSO SEPARATE THE TOPICS WITH "---" BAR AND ADD "- O -" AT THE VERY LAST
    `;

    const response = await getGeminiResponse(inputPrompt);
    const cleanResponse = response.replace(/\*\**/g, '').replace(/##/g, '--');

    const lines = cleanResponse.split('\n');
    const structuredText = lines.map(line => {
      if (line.trim().length === 0) return '';
      if (line === line.toUpperCase()) {
        return { type: 'heading', text: line.trim() };
      } else if (line.startsWith('--')) {
        return { type: 'subheading', text: line.replace('--', '').trim() };
      } else if (line.startsWith('-')) {
        return { type: 'highlight', text: line.trim() };
      } else if (line.startsWith('>')) {
        return { type: 'new', text: line.trim() };
      } else {
        return { type: 'text', text: line.trim() };
      }
    });

    const doc = new PDFDocument();

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F0FFFF');

    const fontPathRegular = path.join(__dirname, 'fonts', 'Exo-Regular.otf');
    const fontPathNothing = path.join(__dirname, 'fonts', 'nothing.otf');
    const fontPathPing = path.join(__dirname, 'fonts', 'Ping.ttf');
    doc.registerFont('CoolFont', fontPathRegular);
    doc.registerFont('NothingFont', fontPathNothing);
    doc.registerFont('Ping', fontPathPing);

    let pdfData = [];
    doc.on('data', chunk => pdfData.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(pdfData);
      res.setHeader('Content-Disposition', 'attachment; filename="response.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      res.send(pdfBuffer);
    });

    const imagePathForPDF = path.join(__dirname, 'logo.png');

    doc.image(imagePathForPDF, 10, 10, { width: 50 });

    doc.on('pageAdded', () => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F0FFFF');
      doc.image(imagePathForPDF, 10, 10, { width: 50 });
    });

    structuredText.forEach(({ type, text }) => {
      if (type === 'heading') {
        doc.font(prompt === 'English' ? 'Ping' : 'Ping')
            .fontSize(16)
            .fillColor('maroon')
            .text(text, { align: 'center' })
            .moveDown();
      } else if (type === 'subheading') {
        doc.font(prompt === 'English' ? 'Ping' : 'Ping')
            .fontSize(15)
            .fillColor('maroon')
            .text(text, { align: 'center' })
            .moveDown();
      } else if (type === 'highlight') {
        doc.font(prompt === 'English' ? 'CoolFont' : 'Ping')
            .fontSize(12)
            .fillColor('green')
            .text(text)
            .moveDown();
      } else if (type === 'new') {
        doc.font(prompt === 'English' ? 'CoolFont' : 'Ping')
            .fontSize(12)
            .fillColor('yellow')
            .text(text)
            .moveDown();
      } else {
        doc.font(prompt === 'English' ? 'Ping' : 'Ping')
            .fontSize(12)
            .fillColor('black')
            .text(text)
            .moveDown();
      }
    });

    doc.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {

    if (notesPath) fs.unlinkSync(notesPath);
    if (imagePath) fs.unlinkSync(imagePath);
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
 
 