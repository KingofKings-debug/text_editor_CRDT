import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import { ThemeContext } from './context/ThemeContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CreateEvent from './pages/CreateEvent';
import EventDetails from './pages/EventDetails';
import TeamManagement from './pages/TeamManagement';
import Submission from './pages/Submission';
import JudgeDashboard from './pages/JudgeDashboard';
import MyEvents from './pages/MyEvents';
import CollaborativeEditor from './pages/CollaborativeEditor';

function NavBar() {
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav>
      <Link to="/" className="brand-title">Collaborative CRDT Platform</Link>
      <div className="nav-links">
        {user ? (
          <>
            <Link to="/editor">CRDT Text Editor</Link>
            <Link to="/my-events">My Events</Link>
            <Link to="/create-event">Create Hackathon</Link>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
              Welcome, {user.username}
            </span>
            <button onClick={handleLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register"><button style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Sign Up</button></Link>
          </>
        )}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </nav>
  );
}

function App() {
  const { user } = useContext(AuthContext);

  return (
    <Router>
      <NavBar />
      <div className="container">
        <Routes>
          <Route path="/" element={user ? <CollaborativeEditor /> : <Home />} />
          <Route path="/editor" element={user ? <CollaborativeEditor /> : <Navigate to="/login" />} />
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
          <Route path="/create-event" element={user ? <CreateEvent /> : <Navigate to="/login" />} />
          <Route path="/my-events" element={user ? <MyEvents /> : <Navigate to="/login" />} />
          <Route path="/event/:id" element={<EventDetails />} />
          <Route path="/events/:eventId/teams" element={user ? <TeamManagement /> : <Navigate to="/login" />} />
          <Route path="/events/:eventId/teams/:teamId/submit" element={user ? <Submission /> : <Navigate to="/login" />} />
          <Route path="/events/:eventId/judge" element={user ? <JudgeDashboard /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
