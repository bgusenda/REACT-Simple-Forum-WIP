import express, { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const usersRoutes = express.Router();
const SALT_ROUNDS = 6;
const { getDb } = require('../connect');

usersRoutes.use((req, res, next) => {
    const db = getDb();
    if (!db) {
        return res.status(503).json({ message: 'Database not connected.' });
    }
    next();
});

//#1 -- Retrieve All Users
usersRoutes.route('/').get(async (_req: Request, res: Response) => {
    try {
        const db = getDb();
        const data = await db
            .collection('users')
            .find({}, { projection: { password: 0 } })
            .toArray();

        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to retrieve users.' });
    }
});

//#2 -- Retrieve One User
usersRoutes.route('/:id').get(async (_req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user id format.' });
        }

        const data = await db
            .collection('users')
            .findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });

        if (!data) {
            return res.status(404).json({ message: 'User not found.' });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to retrieve user.' });
    }
});

//#3 -- Create User
usersRoutes.post('/', async (_req: Request, res: Response) => {
    try {
        const db = getDb();
        const { username, email, password, joinDate, profilePicture, profilepicture } = _req.body;

        if (!username?.trim() || !email?.trim() || !password) {
            return res.status(400).json({ message: 'username, email and password are required.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must have at least 8 characters.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedUsername = username.trim();
        const normalizedProfilePicture =
            typeof profilePicture === 'string'
                ? profilePicture.trim()
                : typeof profilepicture === 'string'
                    ? profilepicture.trim()
                    : '';

        const takenEmail = await db
            .collection('users')
            .findOne({ email: normalizedEmail });

        const takenUsername = await db
            .collection('users')
            .findOne(
                { username: normalizedUsername },
                { collation: { locale: 'en', strength: 2 } }
            );

        if (takenEmail) {
            return res.status(400).json({ message: 'The email is already taken.' });
        }

        if (takenUsername) {
            return res.status(400).json({ message: 'Username already taken.' });
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        const mongoObject = {
            username: normalizedUsername,
            biography: "",
            profilePicture: normalizedProfilePicture,
            email: normalizedEmail,
            password: hash,
            joinDate: joinDate ? new Date(joinDate) : new Date(),
            posts: [],
            fixedPost: "",
            comments: [],
            isAdmin: false
        }

        const result = await db
            .collection('users')
            .insertOne(mongoObject);

        return res.status(201).json({ insertedId: result.insertedId });
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            return res.status(400).json({ message: 'Email or username already taken.' });
        }

        console.error('Create user error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

//#4 -- Update User Account
usersRoutes.route('/:id').put(async (_req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        // Checks if user id is valid
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user id format.' });
        }

        const userId = new ObjectId(id);

        const { username, biography, email, password, newPassword, profilePicture, profilepicture } = _req.body;

        // Current password is required to authorize account changes.
        if (!password) {
            return res.status(400).json({ message: 'Password needed to update account info.' });
        }

        if (newPassword && newPassword.length < 8) {
            return res.status(400).json({ message: 'The new password must have at least 8 characters.' });
        }

        const currentUser = await db
            .collection('users')
            .findOne({ _id: userId });

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(password, currentUser.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        // Updates object to check if any update was made 
        const updates: { [key: string]: unknown } = {};

        if (typeof username === 'string') {
            const normalizedUsername = username.trim();

            if (!normalizedUsername) {
                return res.status(400).json({ message: 'Username cannot be empty.' });
            }

            const takenUsername = await db
                .collection('users')
                .findOne(
                    { username: normalizedUsername, _id: { $ne: userId } },
                    { collation: { locale: 'en', strength: 2 } }
                );

            if (takenUsername) {
                return res.status(400).json({ message: 'Username already taken.' });
            }

            updates.username = normalizedUsername;
        }

        if (typeof email === 'string') {
            const normalizedEmail = email.toLowerCase().trim();

            if (!normalizedEmail) {
                return res.status(400).json({ message: 'Email cannot be empty.' });
            }

            const takenEmail = await db
                .collection('users')
                .findOne({ email: normalizedEmail, _id: { $ne: userId } });

            if (takenEmail) {
                return res.status(400).json({ message: 'The email is already taken.' });
            }

            updates.email = normalizedEmail;
        }

        if (typeof biography === 'string') {
            updates.biography = biography.trim();
        }

        if (typeof profilePicture === 'string') {
            updates.profilePicture = profilePicture.trim();
        } else if (typeof profilepicture === 'string') {
            updates.profilePicture = profilepicture.trim();
        }

        if (typeof newPassword === 'string' && newPassword.length > 0) {
            updates.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided to update.' });
        }

        const result = await db
            .collection('users')
            .updateOne({ _id: userId }, { $set: updates });

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        return res.status(200).json({
            message: 'User account updated successfully.',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            return res.status(400).json({ message: 'Email or username already taken.' });
        }

        console.error('Update user error:', error);
        return res.status(500).json({ message: 'Internal server error. Could not update user account.' });
    }
});

//#5 -- Delete User
usersRoutes.route('/:id').delete(async (_req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        // Checks if user id is valid
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user id format.' });
        }

        const userId = new ObjectId(id);

        const { email, password } = _req.body;

        // Current password is required to authorize account deletion
        if (!password) {
            return res.status(400).json({ message: 'Password needed to delete account.' });
        }

        const currentUser = await db
            .collection('users')
            .findOne({ _id: userId });

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(password, currentUser.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Incorrect password.' });
        }

        // Checks if email's type is string
        if (typeof email === 'string') {
            const normalizedEmail = email.toLocaleLowerCase().trim();

            // Checks if email is not empty
            if (!normalizedEmail) {
                return res.status(400).json({ message: 'Email needed to delete account.' });
            }

            // Current email is required to authorize account deletion
            if (normalizedEmail != currentUser.email) {
                return res.status(401).json({ message: 'Incorrect email.' });
            }
        }

        const result = await db
            .collection('users')
            .deleteOne({ _id: userId });

        return res.status(200).json({
            message: 'User account deleted succesfully.',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({ message: 'Internal Server error. Could not delete user account.' });
    }
});

// #6 -- Login
usersRoutes.post('/login', async (_req: Request, res: Response) => {
    try {
        const db = getDb();
        const { username, email, password } = _req.body;

        if (!password || (!username && !email)) {
            return res.status(400).json({ message: 'Password and (username or email) are required.' });
        }

        if (typeof username === 'string' && username) {
            const normalizedUsername = username.trim();

            const user = await db
                .collection('users')
                .findOne(
                    { username: normalizedUsername },
                    { collation: { locale: 'en', strength: 2 } }
                );

            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            const confirmation = await bcrypt.compare(password, user.password);

            if (confirmation) {
                const lastLogin = new Date();

                // Generate JWT token
                const token = jwt.sign(
                    { _id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin, joinDate: user.joinDate },
                    process.env.JWT_SECRET!,
                    { expiresIn: '7d' }
                );
                return res.status(200).json({
                    message: 'Login successful.',
                    token,
                    user: {
                        _id: user._id,
                        username: user.username,
                        email: user.email,
                        profilePicture: user.profilePicture,
                        lastLogin
                    }
                });
            } else {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }
        }

        if (typeof email === 'string' && email) {
            const normalizedEmail = email.toLowerCase().trim();

            const user = await db
                .collection('users')
                .findOne(
                    { email: normalizedEmail },
                    { collation: { locale: 'en', strength: 2 } }
                );

            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            const confirmation = await bcrypt.compare(password, user.password);

            if (confirmation) {
                const lastLogin = new Date();

                // Generate JWT token
                const token = jwt.sign(
                    { _id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin, joinDate: user.joinDate },
                    process.env.JWT_SECRET!,
                    { expiresIn: '7d' }
                );
                return res.status(200).json({
                    message: 'Login successful.',
                    token,
                    user: {
                        _id: user._id,
                        username: user.username,
                        email: user.email,
                        profilePicture: user.profilePicture,
                        lastLogin
                    }
                });
            } else {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }
        }


    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = usersRoutes;
