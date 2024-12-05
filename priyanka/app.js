const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const tesseract = require('tesseract.js');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');


dotenv.config();
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.apiKey);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    let text = '';

    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else if (req.file.mimetype.startsWith('image/')) {
      text = await extractTextFromImage(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const { numQuestions, language } = req.body;
    if (!numQuestions || isNaN(numQuestions) || numQuestions <= 0) {
      return res.status(400).json({ error: 'Invalid number of questions' });
    }

    if (!language) {
      return res.status(400).json({ error: 'Language preference is required' });
    }

    const questions = await questionGenerator(text, numQuestions, language);
    res.json({ questions });
  } catch (err) {
    console.error('Error processing file and generating quiz:', err.message);
    res.status(500).json({ error: 'Failed to process file and generate quiz' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

async function extractTextFromImage(imageBuffer) {
  try {
    const result = await tesseract.recognize(imageBuffer, 'eng');
    return result.data.text;
  } catch (error) {
    console.error('Error extracting text from image:', error);
    throw new Error('Failed to extract text from image');
  }
}

async function questionGenerator(text, numQuestions, language) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const finalPrompt = `I will give you some text on a topic

  text: ${text}

  According to the above given text, generate ${numQuestions} multiple-choice questions. Each question should have 3 wrong answers and 1 right answer. Format the response as a JSON array where each object represents a question:

  [
      {
          "ques": "Question text",
          "o1": "Option 1",
          "o2": "Option 2",
          "o3": "Option 3",
          "o4": "Option 4",
          "correct": "o1"
      },
      ...
  ]

  Ensure each question object strictly adheres to this format and generate exactly ${numQuestions} questions. IN ${language} LANGUAGE`;

  try {
    const result = await model.generateContent(finalPrompt);
    const responseText = result.response.text();


    const jsonMatch = responseText.match(/\[.*?\]/s);
    if (!jsonMatch) {
      throw new Error('No valid JSON array found in the response');
    }

    const questions = JSON.parse(jsonMatch[0]);
    if (questions.length > numQuestions) {
      console.warn(`Generated more questions than requested: ${questions.length}`);
    }

    return questions.slice(0, numQuestions);
  } catch (error) {
    console.error('Error generating questions:', error);
    return [];
  }
}

