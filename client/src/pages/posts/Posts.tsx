import { useState, useEffect } from "react";
import { getPosts, type Post } from "../../api/postsAPI";
import { PostCard } from "../../components/posts/PostCard";

export function ShowPosts () {
    const [posts, setPosts] = useState<Post[]>([]);

    useEffect(() => {
        getPosts().then(setPosts);
    }, []);

    return (
        <div className="posts">
            {posts.map((post) => {
                return (
                    <PostCard post={post} key={post._id}/>
                );
            })}
        </div>
    );
}


