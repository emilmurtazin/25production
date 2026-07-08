const express = require('express');
const app = express();
const port = 3000;

// Отвечаем на ВСЕ запросы
app.use((req, res) => {
  res.status(200).send('OK');
});

// Слушаем на 0.0.0.0
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Тестовый сервер запущен на порту ${port}`);
});
