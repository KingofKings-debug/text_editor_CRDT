const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { generateToken } = require('./auth');
const store = require('./store');
const config = require('./config');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(express.json());
app.use(morgan('dev'));

// --- REST API ENDPOINTS ---

const generateId = (length = 8) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

app.post('/api/auth/token', (req, res) => {
  const data = req.body || {};
  const siteId = data.siteId || generateId(8);
  const userName = data.userName || `User-${siteId.substring(0, 4)}`;
  const roomId = data.roomId;
  
  const token = generateToken(siteId, userName, roomId);
  res.json({
    token,
    siteId,
    userName,
    roomId
  });
});

app.get('/api/documents', (req, res) => {
  const docs = store.listDocuments();
  res.json(docs);
});

app.post('/api/documents', (req, res) => {
  const data = req.body || {};
  const docId = data.id || generateId(8);
  const title = data.title || `Room ${docId}`;
  const initialText = data.initialText || '';
  
  const existing = store.getDocument(docId);
  if (existing) {
    return res.status(200).json(existing);
  }
  
  const doc = store.createDocument(docId, title, initialText);
  res.status(201).json(doc);
});

app.get('/api/documents/:doc_id', (req, res) => {
  const docId = req.params.doc_id;
  const doc = store.getDocument(docId);
  
  if (!doc) {
    return res.status(404).json({ error: 'No room found with this ID' });
  }
  
  const ops = store.getOperations(docId);
  res.json({
    document: doc,
    operations: ops
  });
});

app.put('/api/documents/:doc_id', (req, res) => {
  const docId = req.params.doc_id;
  const data = req.body || {};
  
  let doc = store.getDocument(docId);
  if (!doc) {
    return res.status(404).json({ error: 'No room found with this ID' });
  }
  
  if (data.title) {
    doc = store.updateDocumentTitle(docId, data.title);
  }
  if (data.text !== undefined) {
    store.updateDocumentText(docId, data.text);
    doc = store.getDocument(docId);
  }
  
  res.json(doc || {});
});

app.delete('/api/documents/:doc_id', (req, res) => {
  const docId = req.params.doc_id;
  const doc = store.getDocument(docId);
  
  if (!doc) {
    return res.status(404).json({ error: 'No room found with this ID' });
  }
  
  store.deleteDocument(docId);
  res.json({ success: true });
});

module.exports = app;
