import { getPost, type Post } from "../../api/postsAPI";
import { getComments, type Comment } from "../../api/commentsAPI";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { CommentCard } from "../../components/posts/CommentCard";

// STYLE
import "./post.scss"

export function ReadPost() {
    const [post, setPost] = useState<Post | null>(null)
    const [comments, setComments] = useState<Comment[]>([])

    let params = useParams()
    const navigate = useNavigate()
    let id = params.id

    useEffect(() => {
        async function loadPost() {
            if (!id) return
            let data = await getPost(id)
            setPost(data)
        }
        loadPost()
    }, [])

    function formatDate(date: unknown) {
        if (!date) return "Data não disponível"
        const d = new Date(date as string)
        return isNaN(d.getTime())
            ? "Data inválida"
            : d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "numeric",
                year: "numeric"
            })
    }

    if (!post) {
        return <div>Carregando Posto...</div>
    }

    return (
        <div className="postPage">
            <div className="postContainer">
                <div className="postHeader">
                    <div className="div1">
                        <button className="backButton" onClick={() => navigate(-1)}>Back</button>
                        <span></span>
                        <h1 className="postTitle">{post.title}</h1>
                    </div>
                    <div className="div2">
                        <p className="postAuthor">Feito por: <span>{post.author}</span></p>
                        <p className="postDate">Postado em: <span>{formatDate(post.postedDate)}</span></p>
                        {post.edited === true && <p>Post Editado em: <span>{formatDate(post.lastEditDate)}</span></p>}
                    </div>
                </div>
                <div className="postDescription">
                    <text>{post.description}</text>
                </div>
                <div className="postContent">
                    <p className="postTextContent">{post.content}</p>
                    <div>
                        <button className="postInfo">S {post.upvotes}</button>
                        <button className="postInfo">N {post.downvotes}</button>
                        <span className="postInfo">V {post.views}</span>
                    </div>
                </div>
            </div>
            <div className="commentsContainer">
                <div>Comments ({comments.length})</div>
                {id && <ShowComments postId={id} onLoad={setComments} />}
            </div>
        </div>
    )
}

interface ShowCommentsProps {
    postId: string;
    onLoad: (comments: Comment[]) => void;
}

const ShowComments = ({ postId, onLoad }: ShowCommentsProps) => {
    const [comments, setComments] = useState<Comment[]>([]);

    useEffect(() => {
        getComments(postId).then((data) => {
            setComments(data);
            onLoad(data);
        });
    }, [postId, onLoad]);

    return (
        <div className="postComments">
            {
                comments.map((comment, index) => {
                    return (
                        <CommentCard key={index} comment={comment} />
                    )
                })
            }
        </div>
    )
}