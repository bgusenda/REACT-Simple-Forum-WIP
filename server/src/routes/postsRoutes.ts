import express, { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import jwt, { JwtPayload } from 'jsonwebtoken';

const postsRoutes = express.Router();
const { getDb } = require('../connect');

interface AuthenticatedRequest<
    P = Record<string, string>,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: string | JwtPayload;
}

interface CreatePostBody {
    title?: unknown;
    description?: unknown;
    content?: unknown;
    postedDate?: unknown;
    tags?: unknown;
}

interface UpdatePostBody {
    title?: unknown;
    description?: unknown;
    content?: unknown;
    lastEditDate?: unknown;
    tags?: unknown;
}

function normalizeTokenIdentifier(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (typeof value === 'number') {
        return String(value);
    }

    if (value && typeof value === 'object') {
        const asText = String(value).trim();
        if (asText && asText !== '[object Object]') {
            return asText;
        }
    }

    return undefined;
}

function getAuthorFromToken(user: string | JwtPayload | undefined): string | undefined {
    if (!user) {
        return undefined;
    }

    if (typeof user === 'string') {
        return normalizeTokenIdentifier(user);
    }

    return (
        normalizeTokenIdentifier(user.id) ||
        normalizeTokenIdentifier(user._id) ||
        normalizeTokenIdentifier(user.sub)
    );
}

function getAuthorNameFromToken(user: string | JwtPayload | undefined): string | undefined {
    if (!user || typeof user === 'string') {
        return undefined;
    }

    const candidate =
        (typeof user.username === 'string' && user.username.trim()) ||
        (typeof user.name === 'string' && user.name.trim());

    return candidate || undefined;
}

function getIsAdminFromToken(user: string | JwtPayload | undefined): boolean {
    return Boolean(user && typeof user !== 'string' && user.isAdmin === true);
}

postsRoutes.use((req, res, next) => {
    const db = getDb();
    if (!db) {
        return res.status(503).json({ message: 'Database not connected.' });
    }
    next();
});

//#1 -- Retrieve All Posts
postsRoutes.route('/').get(async (_req: Request, res: Response) => {
    try {
        const db = getDb();
        const data = await db
            .collection('posts')
            .find({})
            .toArray();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to retrieve posts.' });
    }
});

//#2 -- Retrieve One Post
postsRoutes.route('/:id').get(async (_req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid post id format.' });
        }

        const data = await db
            .collection('posts')
            .findOne({ _id: new ObjectId(id) });

        if (!data) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to retrieve post.' });
    }
});

//#3 -- Create One Post
postsRoutes.post('/', verifyToken, async (_req: AuthenticatedRequest<Record<string, string>, any, CreatePostBody>, res: Response) => {
    try {
        const db = getDb();
        const { title, description, content, postedDate, tags } = _req.body;

        if (
            typeof title !== 'string' ||
            typeof description !== 'string' ||
            typeof content !== 'string'
        ) {
            return res.status(400).json({
                message: 'title, description and content must be strings.'
            });
        }

        const normalizedTitle = title.trim();
        const normalizedDescription = description.trim();
        const normalizedContent = content.trim();

        if (
            !normalizedTitle || !normalizedDescription || !normalizedContent
        ) {
            return res.status(400).json({
                message: 'title, description and content are required.'
            });
        }

        if (normalizedTitle.length > 30) {
            return res.status(400).json({
                message: "Title can't be more than 30 characters."
            });
        }

        if (normalizedDescription.length > 120) {
            return res.status(400).json({
                message: "Description can't be more than 120 characters."
            });
        }

        const hasPostedDateInput = postedDate !== undefined && postedDate !== null && postedDate !== '';
        const postedDateInput =
            postedDate instanceof Date || typeof postedDate === 'string' || typeof postedDate === 'number'
                ? postedDate
                : undefined;

        if (hasPostedDateInput && postedDateInput === undefined) {
            return res.status(400).json({
                message: 'postedDate is invalid.'
            });
        }

        const parsedPostedDate = postedDateInput !== undefined ? new Date(postedDateInput) : new Date();

        if (Number.isNaN(parsedPostedDate.getTime())) {
            return res.status(400).json({
                message: 'postedDate is invalid.'
            });
        }

        const normalizedTags = Array.isArray(tags)
            ? tags
                .filter((tag: unknown): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [];

        const authorFromToken = getAuthorFromToken(_req.user);
        const authorNameFromToken = getAuthorNameFromToken(_req.user);
        const normalizedAuthor = authorFromToken;
        const normalizedAuthorName = authorNameFromToken;

        if (!normalizedAuthor || !normalizedAuthorName) {
            return res.status(403).json({
                message: 'Token payload does not include a valid user identity.'
            });
        }

        const mongoObject = {
            title: normalizedTitle,
            description: normalizedDescription,
            content: normalizedContent,
            author: normalizedAuthor,
            authorName: normalizedAuthorName,
            postedDate: parsedPostedDate,
            lastEditDate: null,
            upvotes: 0,
            downvotes: 0,
            comments: [],
            edited: false,
            tags: normalizedTags
        };

        const result = await db
            .collection('posts')
            .insertOne(mongoObject);

        return res.status(201).json({ insertedId: result.insertedId });
    } catch (error) {
        console.error('Create post error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

//#4 -- Edit Post
postsRoutes.route('/:id').put(verifyToken, async (_req: AuthenticatedRequest<{ id: string }, any, UpdatePostBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        // Checks if post id is valid
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid post id format.' });
        }

        const postId = new ObjectId(id);

        const { title, description, content, lastEditDate, tags } = _req.body;

        const currentPost = await db
            .collection('posts')
            .findOne({ _id: postId });

        if (!currentPost) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        const requesterId = getAuthorFromToken(_req.user);
        if (!requesterId) {
            return res.status(403).json({ message: 'Token payload does not include a valid user identifier.' });
        }

        const isAdmin = getIsAdminFromToken(_req.user);
        const postAuthor = typeof currentPost.author === 'string' ? currentPost.author : '';
        if (!isAdmin && postAuthor !== requesterId) {
            return res.status(403).json({ message: 'You can only edit your own posts.' });
        }

        if (
            typeof title !== 'string' ||
            typeof description !== 'string' ||
            typeof content !== 'string'
        ) {
            return res.status(400).json({
                message: 'title, description and content must be strings.'
            });
        }

        const normalizedTitle = title.trim();
        const normalizedDescription = description.trim();
        const normalizedContent = content.trim();

        if (
            !normalizedTitle || !normalizedDescription || !normalizedContent
        ) {
            return res.status(400).json({
                message: 'title, description and content are required.'
            });
        }

        if (normalizedTitle.length > 30) {
            return res.status(400).json({
                message: "Title can't be more than 30 characters."
            });
        }

        if (normalizedDescription.length > 120) {
            return res.status(400).json({
                message: "Description can't be more than 120 characters."
            });
        }

        const hasLastEditDateInput = lastEditDate !== undefined && lastEditDate !== null && lastEditDate !== '';
        const lastEditDateInput =
            lastEditDate instanceof Date || typeof lastEditDate === 'string' || typeof lastEditDate === 'number'
                ? lastEditDate
                : undefined;

        if (hasLastEditDateInput && lastEditDateInput === undefined) {
            return res.status(400).json({
                message: 'lastEditDate is invalid.'
            });
        }

        const parsedLastEditDate = lastEditDateInput !== undefined ? new Date(lastEditDateInput) : new Date();

        if (Number.isNaN(parsedLastEditDate.getTime())) {
            return res.status(400).json({
                message: 'lastEditDate is invalid.'
            });
        }

        const normalizedTags = Array.isArray(tags)
            ? tags
                .filter((tag: unknown): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [];

        const mongoObject = {
            title: normalizedTitle,
            description: normalizedDescription,
            content: normalizedContent,
            lastEditDate: parsedLastEditDate,
            edited: true,
            tags: normalizedTags
        };

        const result = await db
            .collection('posts')
            .updateOne({ _id: postId }, { $set: mongoObject });

        return res.status(200).json({ 
            message: 'Post edited successfully.',
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error('Edit post error:', error);
        return res.status(500).json({ message: 'Internal server error. Could not edit Post.' });
    }
});

//#5 -- Delete Post
postsRoutes.route('/:id').delete(verifyToken, async (_req: AuthenticatedRequest<{ id: string }>, res: Response ) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        // Checks if post id is valid
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid post id format.' });
        }

        const postId = new ObjectId(id);

        const currentPost = await db
            .collection('posts')
            .findOne({ _id: postId });

        if (!currentPost) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        const requesterId = getAuthorFromToken(_req.user);
        if (!requesterId) {
            return res.status(403).json({ message: 'Token payload does not include a valid user identifier.' });
        }

        const isAdmin = getIsAdminFromToken(_req.user);
        const postAuthor = typeof currentPost.author === 'string' ? currentPost.author : '';
        if (!isAdmin && postAuthor !== requesterId) {
            return res.status(403).json({ message: 'You can only delete your own posts.' });
        }
        
        const result = await db
            .collection('posts')
            .deleteOne({ _id: postId });

        return res.status(200).json({
            message: 'Post deleted successfully.',
            deletedCount: result.deletedCount
        })

    } catch (error) {
        console.error('Delete post error:', error);
        return res.status(500).json({ message: 'Internal server error. Could not delete post.' });
    }
});

function verifyToken(_req: Request, res: Response, next: NextFunction) {
    const req = _req as AuthenticatedRequest;
    const authHeaders = req.headers['authorization'];
    console.log('Authorization header:', authHeaders);
    const token =
        typeof authHeaders === 'string' && authHeaders.startsWith('Bearer ')
            ? authHeaders.slice(7).trim()
            : undefined;

    if (!token) {
        console.log('Token missing');
        return res.status(401).json({ message: 'Authentication token is missing' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: 'JWT_SECRET is not configured.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if (error) {
            console.log('JWT error:', error);
            return res.status(403).json({ message: 'Invalid Token' });
        }

        req.user = user;
        next();
    });
}

module.exports = postsRoutes;
