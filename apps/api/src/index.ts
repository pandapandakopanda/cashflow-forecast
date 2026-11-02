import express from 'express';
import errorHandler from './middleware/errorHandler';

import type { Request, Response } from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`API запущен http://localhost:${port}`);
});
