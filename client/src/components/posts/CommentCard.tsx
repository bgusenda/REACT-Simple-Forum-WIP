import { type Comment } from "../../api/commentsAPI"
import { Link } from "react-router-dom"

interface CommentsCardProps {
    comment: Comment
}

export function CommentCard({comment}: CommentsCardProps) {
    return (
        <div className="commentCard">
            <div className="commentInfo">
                <Link to={`/user/${comment.authorId}`} className="commentAuthor">{comment.authorName}</Link>
                {comment.edited === true && <div className="edited">editado</div>}
            </div>
            <p className="commentContent">{comment.content}</p>
            <div className="commentVotes">
                <button className="commentInfo">{comment.upvotes}</button>
                <button className="commentInfo">{comment.downvotes}</button>
            </div>
        </div>
    )
}