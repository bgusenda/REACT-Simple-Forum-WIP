import axios from 'axios';

const URL = "http://localhost:3000";

export interface Comment {
    _id: string;
    content: string;
    postId: string;
    authorId: string;
    authorName: string;
    upvotes: number;
    downvotes: number;
    mentions: string[];
    edited: boolean;
}

export async function getComments(postId?: string) {
    //"http://localhost:3000/comments"
    const response = await axios.get(`${URL}/comments`, {
        params: { postId }
    })

    if (response.status === 200) {
        return response.data
    } else {
        return
    }
}