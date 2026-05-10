import axios from 'axios';

const URL = "http://localhost:3000";

export interface Post {
    _id: string;
    title: string;
    description: string;
    content: string;
    author: string;
    postedDate: Date;
    lastEditDate: Date;
    upvotes: number;
    downvotes: number;
    edited: boolean;
    views: number;
    comments: string[];
}

export async function getPosts() {
    //"http://localhost:3000/posts"
    const response = await axios.get(`${URL}/posts`)

    if (response.status === 200) {
        return response.data
    } else {
        return
    }
}

export async function getPost(id: string) {
    //"http://localhost:3000/posts/12345"
    const response = await axios.get(`${URL}/posts/${id}`)

    if (response.status === 200) {
        return response.data
    } else {
        return
    }
}