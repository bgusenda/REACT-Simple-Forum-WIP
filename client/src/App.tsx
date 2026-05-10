import './App.css'

// DEVS
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import axios from 'axios'

// PAGES
import { ShowPosts } from './pages/posts/Posts'
import { ReadPost } from './pages/posts/Post'
import { Layout } from './components/Layout'

// COMPONENTS

function App() {

  return (
    <Router>
      <Routes>
        <Route element={<Layout/>}>
          <Route path="/" element={<ShowPosts />} /> 
          <Route path="/post/:id" element={<ReadPost />} /> 
        </Route>
      </Routes>
    </Router>
  )
}

export default App
