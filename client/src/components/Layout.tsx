import { Outlet } from "react-router-dom";

import "./layout.scss"

export function Layout() {
    return (
        <div className="layoutDiv">
            <div className="userSide">
                user
            </div>
            <div className="bodyContent">
                <Outlet />
            </div>
            <div className="trendingPosts">
                trending posts
            </div>
        </div>
    )
}