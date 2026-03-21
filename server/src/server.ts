import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';

const usersRoutes = require('./routes/usersRoutes');
const { connectToServer } = require('./connect');

require('dotenv').config({ path: path.resolve(__dirname, './config.env') });

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use('/users', usersRoutes);
app.use(express.urlencoded({ extended: true }));

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send(`Server is running with MONGODB_URI: ${uri}`);
});

const PORT: string | number = process.env.PORT || 3000;

connectToServer()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on PORT: <span>${PORT}</span>`);
        });
    })
    .catch((error: unknown) => {
        console.error('Server startup failed: ', error);
        process.exit(1);
    });