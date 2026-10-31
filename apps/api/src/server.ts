import { app } from './app.js';
import { localDemo } from './config.js';
import { seed } from './seed.js';
if (localDemo) await seed();
app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log(
    `SistaBrew API listening on ${process.env.PORT || 3001}${localDemo ? ' (local demo)' : ''}`,
  ),
);
