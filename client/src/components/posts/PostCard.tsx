import { type Post } from "../../api/postsAPI";
import { Link } from "react-router-dom"

interface PostCardProps {
    post: Post
}

export function PostCard ({post}: PostCardProps) {

    function formatDate(date: unknown) {
        if(!date) return "Data não disponível"
        const d = new Date(date as string)
        return isNaN(d.getTime())
            ? "Data inválida"
            : d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            })
    }

    return (
        <Link to={`/post/${post._id}`}>
            <h2>{post.title}</h2>
            <h2>{post.description}</h2>
            <p>{formatDate(post.postedDate)}</p>
        </Link>
    )
}