import { db } from './db'
import { createApp } from './app'

const app = createApp(db)
const port = Number(process.env.PORT ?? 3001)

app.listen(port, () => {
  console.log(`API запущен http://localhost:${port}`)
})
