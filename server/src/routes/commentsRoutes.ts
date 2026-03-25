import express, { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import jwt, { JwtPayload } from 'jsonwebtoken';

const commentsRoutes = express.Router();
const { getDb } = require('../connect');

interface AuthenticatedRequest<
    P = Record<string, string>,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: string | JwtPayload;
}

interface Mention {
    userId: string;
    userName: string;
}

interface CreateCommentBody {
    postId?: unknown;
    content?: unknown;
    mentions?: unknown;
}

interface UpdateCommentBody {
    content?: unknown;
    mentions?: unknown;
    lastEditDate?: unknown;
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

function getAuthorIdFromToken(user: string | JwtPayload | undefined): string | undefined {
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

function normalizeMentions(input: unknown): Mention[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const mentions: Mention[] = [];

    for (const item of input) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const maybeMention = item as { userId?: unknown; userName?: unknown };
        const userId = typeof maybeMention.userId === 'string' ? maybeMention.userId.trim() : '';
        const userName = typeof maybeMention.userName === 'string' ? maybeMention.userName.trim() : '';

        if (userId && userName) {
            mentions.push({ userId, userName });
        }
    }

    return mentions;
}

commentsRoutes.use((req, res, next) => {
    const db = getDb();
    if (!db) {
        return res.status(503).json({ message: 'Database not connected.' });
    }
    next();
});

//#1 -- Retrieve Comments (optionally by postId)
commentsRoutes.get('/', async (_req: Request<Record<string, string>, any, any, { postId?: string }>, res: Response) => {
    try {
        const db = getDb();
        const { postId } = _req.query;

        const filter: { postId?: string } = {};

        if (typeof postId === 'string' && postId.trim()) {
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({ message: 'Invalid post id format.' });
            }
            filter.postId = postId.trim();
        }

        const data = await db
            .collection('comments')
            .find(filter)
            .toArray();

        return res.status(200).json(data);
    } catch (error) {
        console.error('Retrieve comments error:', error);
        return res.status(500).json({ message: 'Failed to retrieve comments.' });
    }
});

//#2 -- Retrieve One Comment
commentsRoutes.get('/:id', async (_req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid comment id format.' });
        }

        const data = await db
            .collection('comments')
            .findOne({ _id: new ObjectId(id) });

        if (!data) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('Retrieve comment error:', error);
        return res.status(500).json({ message: 'Failed to retrieve comment.' });
    }
});

//#3 -- Create Comment
commentsRoutes.post('/', verifyToken, async (_req: AuthenticatedRequest<Record<string, string>, any, CreateCommentBody>, res: Response) => {
    try {
        const db = getDb();
        const { postId, content, mentions } = _req.body;

        if (typeof postId !== 'string' || !postId.trim() || !ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'Valid postId is required.' });
        }

        if (typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ message: 'content is required.' });
        }

        const normalizedContent = content.trim();
        if (normalizedContent.length > 1000) {
            return res.status(400).json({ message: 'content cannot exceed 1000 characters.' });
        }

        const postExists = await db
            .collection('posts')
            .findOne({ _id: new ObjectId(postId.trim()) });

        if (!postExists) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        const authorId = getAuthorIdFromToken(_req.user);
        const authorName = getAuthorNameFromToken(_req.user);

        if (!authorId || !authorName) {
            return res.status(403).json({ message: 'Token payload does not include a valid user identity.' });
        }

        const mongoObject = {
            postId: postId.trim(),
            content: normalizedContent,
            authorId,
            authorName,
            postedDate: new Date(),
            lastEditDate: null,
            upvotes: 0,
            downvotes: 0,
            mentions: normalizeMentions(mentions),
            edited: false
        };

        const result = await db
            .collection('comments')
            .insertOne(mongoObject);

        return res.status(201).json({ insertedId: result.insertedId });
    } catch (error) {
        console.error('Create comment error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

//#4 -- Edit Comment
commentsRoutes.put('/:id', verifyToken, async (_req: AuthenticatedRequest<{ id: string }, any, UpdateCommentBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;
        const { content, mentions, lastEditDate } = _req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid comment id format.' });
        }

        const commentId = new ObjectId(id);

        const currentComment = await db
            .collection('comments')
            .findOne({ _id: commentId });

        if (!currentComment) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        const requesterId = getAuthorIdFromToken(_req.user);
        if (!requesterId) {
            return res.status(403).json({ message: 'Token payload does not include a valid user identifier.' });
        }

        const isAdmin = getIsAdminFromToken(_req.user);
        const commentAuthor = typeof currentComment.authorId === 'string' ? currentComment.authorId : '';
        if (!isAdmin && commentAuthor !== requesterId) {
            return res.status(403).json({ message: 'You can only edit your own comments.' });
        }

        if (typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ message: 'content is required.' });
        }

        const normalizedContent = content.trim();
        if (normalizedContent.length > 1000) {
            return res.status(400).json({ message: 'content cannot exceed 1000 characters.' });
        }

        const hasLastEditDateInput = lastEditDate !== undefined && lastEditDate !== null && lastEditDate !== '';
        const lastEditDateInput =
            lastEditDate instanceof Date || typeof lastEditDate === 'string' || typeof lastEditDate === 'number'
                ? lastEditDate
                : undefined;

        if (hasLastEditDateInput && lastEditDateInput === undefined) {
            return res.status(400).json({ message: 'lastEditDate is invalid.' });
        }

        const parsedLastEditDate = lastEditDateInput !== undefined ? new Date(lastEditDateInput) : new Date();

        if (Number.isNaN(parsedLastEditDate.getTime())) {
            return res.status(400).json({ message: 'lastEditDate is invalid.' });
        }

        const result = await db
            .collection('comments')
            .updateOne(
                { _id: commentId },
                {
                    $set: {
                        content: normalizedContent,
                        mentions: normalizeMentions(mentions),
                        edited: true,
                        lastEditDate: parsedLastEditDate
                    }
                }
            );

        return res.status(200).json({
            message: 'Comment edited successfully.',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Edit comment error:', error);
        return res.status(500).json({ message: 'Internal server error. Could not edit comment.' });
    }
});

//#5 -- Delete Comment
commentsRoutes.delete('/:id', verifyToken, async (_req: AuthenticatedRequest<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = _req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid comment id format.' });
        }

        const commentId = new ObjectId(id);

        const currentComment = await db
            .collection('comments')
            .findOne({ _id: commentId });

        if (!currentComment) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        const requesterId = getAuthorIdFromToken(_req.user);
        if (!requesterId) {
            return res.status(403).json({ message: 'Token payload does not include a valid user identifier.' });
        }

        const isAdmin = getIsAdminFromToken(_req.user);
        const commentAuthor = typeof currentComment.authorId === 'string' ? currentComment.authorId : '';
        if (!isAdmin && commentAuthor !== requesterId) {
            return res.status(403).json({ message: 'You can only delete your own comments.' });
        }

        const result = await db
            .collection('comments')
            .deleteOne({ _id: commentId });

        return res.status(200).json({
            message: 'Comment deleted successfully.',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Delete comment error:', error);
        return res.status(500).json({ message: 'Internal server error. Could not delete comment.' });
    }
});

function verifyToken(_req: Request, res: Response, next: NextFunction) {
    const req = _req as AuthenticatedRequest;
    const authHeaders = req.headers['authorization'];
    const token =
        typeof authHeaders === 'string' && authHeaders.startsWith('Bearer ')
            ? authHeaders.slice(7).trim()
            : undefined;

    if (!token) {
        return res.status(401).json({ message: 'Authentication token is missing' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: 'JWT_SECRET is not configured.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if (error) {
            return res.status(403).json({ message: 'Invalid Token' });
        }

        req.user = user;
        next();
    });
}

module.exports = commentsRoutes;
